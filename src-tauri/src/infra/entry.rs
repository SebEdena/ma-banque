//! SQLite access to the `entries` table (see
//! `migrations/0004_create_entries.sql`).
//!
//! The SQL lives in free functions over a plain `&Connection` so that
//! `infra::account` can run the account and system-entry writes inside one
//! transaction (a `Transaction` derefs to `Connection`) without duplicating
//! any of it — the two repositories share one connection, so a use case
//! spanning both could never hold a transaction of its own.

use rusqlite::{Connection, OptionalExtension, ToSql};

use crate::domain::date::IsoDate;
use crate::domain::entry::{
    self, Entry, EntryDetails, EntryError, EntryKind, EntryListQuery, EntryPage, EntryRepository,
    SignedCents, SortDirection, SystemEntry,
};
use crate::infra::db::SharedConnection;

const ENTRY_COLUMNS: &str =
    "id, account_id, label, category_id, date, type, amount, description, is_system, reconciled";

/// The columns every entry row carries, before the stored strings are parsed
/// into their domain types — kept separate from [`Entry`] so a malformed row
/// can be reported as an [`EntryError`] rather than panicking inside
/// `rusqlite`'s row-mapping closure, which can only fail with
/// `rusqlite::Error`.
struct RawEntry {
    id: i64,
    account_id: i64,
    label: String,
    category_id: Option<i64>,
    date: String,
    kind: String,
    amount: i64,
    description: String,
    is_system: bool,
    reconciled: bool,
}

fn map_entry_row(row: &rusqlite::Row) -> rusqlite::Result<RawEntry> {
    Ok(RawEntry {
        id: row.get(0)?,
        account_id: row.get(1)?,
        label: row.get(2)?,
        category_id: row.get(3)?,
        date: row.get(4)?,
        kind: row.get(5)?,
        amount: row.get(6)?,
        description: row.get(7)?,
        is_system: row.get::<_, i64>(8)? != 0,
        reconciled: row.get::<_, i64>(9)? != 0,
    })
}

impl RawEntry {
    fn into_entry(self) -> Result<Entry, EntryError> {
        Ok(Entry {
            id: self.id,
            account_id: self.account_id,
            label: self.label,
            category_id: self.category_id,
            date: IsoDate::parse(&self.date)
                .map_err(|e| EntryError::InvalidStoredValue(e.to_string()))?,
            amount: SignedCents {
                kind: EntryKind::parse(&self.kind)?,
                amount: self.amount,
            },
            description: self.description,
            is_system: self.is_system,
            reconciled: self.reconciled,
        })
    }
}

/// Maps a `category_id` foreign-key violation to
/// [`EntryError::UnknownCategory`]; anything else is a plain I/O failure.
fn map_write_error(e: rusqlite::Error) -> EntryError {
    if let rusqlite::Error::SqliteFailure(ref sqlite_err, Some(ref message)) = e {
        if sqlite_err.code == rusqlite::ErrorCode::ConstraintViolation
            && message.contains("FOREIGN KEY")
        {
            return EntryError::UnknownCategory;
        }
    }
    io_err(e)
}

pub fn insert_system_entry(
    conn: &Connection,
    account_id: i64,
    entry: &SystemEntry,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO entries (account_id, date, type, amount, is_system) VALUES (?1, ?2, ?3, ?4, 1)",
        rusqlite::params![
            account_id,
            entry.date.as_str(),
            entry.amount.kind.as_str(),
            entry.amount.amount,
        ],
    )?;
    Ok(())
}

pub fn update_system_entry_date_and_amount(
    conn: &Connection,
    account_id: i64,
    entry: &SystemEntry,
) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE entries SET date = ?1, type = ?2, amount = ?3 WHERE account_id = ?4 AND is_system = 1",
        rusqlite::params![
            entry.date.as_str(),
            entry.amount.kind.as_str(),
            entry.amount.amount,
            account_id,
        ],
    )
}

pub fn delete_by_account(conn: &Connection, account_id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM entries WHERE account_id = ?1", [account_id])?;
    Ok(())
}

pub struct SqliteEntryRepository {
    conn: SharedConnection,
}

impl SqliteEntryRepository {
    pub fn new(conn: SharedConnection) -> Self {
        Self { conn }
    }
}

fn io_err<E: std::fmt::Display>(e: E) -> EntryError {
    EntryError::Io(e.to_string())
}

impl SqliteEntryRepository {
    /// Every entry belonging to `account_id`, through the shared row mapper
    /// — the base both `sum_by_account` and `last_entry_date` reduce.
    fn fetch_all(&self, account_id: i64) -> Result<Vec<Entry>, EntryError> {
        let conn = self.conn.lock().unwrap();
        let mut statement = conn
            .prepare(&format!(
                "SELECT {ENTRY_COLUMNS} FROM entries WHERE account_id = ?1"
            ))
            .map_err(io_err)?;

        let raws = statement
            .query_map([account_id], map_entry_row)
            .map_err(io_err)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(io_err)?;

        raws.into_iter().map(RawEntry::into_entry).collect()
    }
}

impl EntryRepository for SqliteEntryRepository {
    /// Sums in Rust rather than in SQL so the debit/credit sign rule has one
    /// home — `domain::entry::balance` — instead of a `CASE` expression here
    /// that could drift from it.
    fn sum_by_account(&self, account_id: i64) -> Result<i64, EntryError> {
        let entries = self.fetch_all(account_id)?;
        Ok(entry::balance(entries.into_iter().map(|e| e.amount)))
    }

    fn last_entry_date(&self, account_id: i64) -> Result<Option<IsoDate>, EntryError> {
        let entries = self.fetch_all(account_id)?;
        Ok(entries.into_iter().map(|e| e.date).max())
    }

    fn exists_non_system_on_or_before(
        &self,
        account_id: i64,
        date: &IsoDate,
    ) -> Result<bool, EntryError> {
        self.conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM entries \
                 WHERE account_id = ?1 AND is_system = 0 AND date <= ?2)",
                rusqlite::params![account_id, date.as_str()],
                |row| row.get(0),
            )
            .map_err(io_err)
    }

    fn count_non_system_by_account(&self, account_id: i64) -> Result<i64, EntryError> {
        self.conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM entries WHERE account_id = ?1 AND is_system = 0",
                [account_id],
                |row| row.get(0),
            )
            .map_err(io_err)
    }

    fn count_by_category(&self, category_id: i64) -> Result<i64, EntryError> {
        self.conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM entries WHERE category_id = ?1",
                [category_id],
                |row| row.get(0),
            )
            .map_err(io_err)
    }

    fn list_by_account(
        &self,
        account_id: i64,
        query: &EntryListQuery,
    ) -> Result<EntryPage, EntryError> {
        let order = match query.sort {
            SortDirection::Asc => "ASC",
            SortDirection::Desc => "DESC",
        };

        let mut filter_clauses: Vec<&str> = vec![];
        let mut filter_params: Vec<Box<dyn ToSql>> = vec![];
        if let Some(from) = &query.from {
            filter_clauses.push("date >= ?");
            filter_params.push(Box::new(from.as_str().to_owned()));
        }
        if let Some(to) = &query.to {
            filter_clauses.push("date <= ?");
            filter_params.push(Box::new(to.as_str().to_owned()));
        }

        let mut sql = format!("SELECT {ENTRY_COLUMNS} FROM entries WHERE account_id = ?");
        let mut params: Vec<Box<dyn ToSql>> = vec![Box::new(account_id)];
        if !filter_clauses.is_empty() {
            sql.push_str(&format!(
                " AND (is_system = 1 OR ({}))",
                filter_clauses.join(" AND ")
            ));
            params.extend(filter_params);
        }
        sql.push_str(&format!(
            " ORDER BY date {order}, id {order} LIMIT ? OFFSET ?"
        ));
        // Fetches one row past the page to tell whether another page
        // follows, without paying for a separate `COUNT(*)`.
        params.push(Box::new(query.limit + 1));
        params.push(Box::new(query.offset));

        let conn = self.conn.lock().unwrap();
        let param_refs: Vec<&dyn ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let mut statement = conn.prepare(&sql).map_err(io_err)?;
        let raws = statement
            .query_map(param_refs.as_slice(), map_entry_row)
            .map_err(io_err)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(io_err)?;

        let has_more = raws.len() as i64 > query.limit;
        let entries = raws
            .into_iter()
            .take(query.limit as usize)
            .map(RawEntry::into_entry)
            .collect::<Result<Vec<_>, _>>()?;

        Ok(EntryPage { entries, has_more })
    }

    fn offset_for_date(
        &self,
        account_id: i64,
        from: Option<&IsoDate>,
        to: Option<&IsoDate>,
        sort: SortDirection,
        target: &IsoDate,
    ) -> Result<i64, EntryError> {
        let mut visibility_clauses: Vec<&str> = vec![];
        let mut params: Vec<Box<dyn ToSql>> = vec![Box::new(account_id)];
        let mut visibility_params: Vec<Box<dyn ToSql>> = vec![];
        if let Some(from) = from {
            visibility_clauses.push("date >= ?");
            visibility_params.push(Box::new(from.as_str().to_owned()));
        }
        if let Some(to) = to {
            visibility_clauses.push("date <= ?");
            visibility_params.push(Box::new(to.as_str().to_owned()));
        }

        let mut sql = String::from("SELECT COUNT(*) FROM entries WHERE account_id = ?");
        if !visibility_clauses.is_empty() {
            sql.push_str(&format!(
                " AND (is_system = 1 OR ({}))",
                visibility_clauses.join(" AND ")
            ));
            params.extend(visibility_params);
        }

        // Entries positioned strictly before the target in the current sort
        // order: later dates come first when sorting desc, earlier ones
        // first when sorting asc.
        let cmp = match sort {
            SortDirection::Desc => ">",
            SortDirection::Asc => "<",
        };
        sql.push_str(&format!(" AND date {cmp} ?"));
        params.push(Box::new(target.as_str().to_owned()));

        let conn = self.conn.lock().unwrap();
        let param_refs: Vec<&dyn ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.query_row(&sql, param_refs.as_slice(), |row| row.get(0))
            .map_err(io_err)
    }

    fn find(&self, id: i64) -> Result<Option<Entry>, EntryError> {
        let conn = self.conn.lock().unwrap();
        let raw: Option<RawEntry> = conn
            .query_row(
                &format!("SELECT {ENTRY_COLUMNS} FROM entries WHERE id = ?1"),
                [id],
                map_entry_row,
            )
            .optional()
            .map_err(io_err)?;

        raw.map(RawEntry::into_entry).transpose()
    }

    fn create(&self, account_id: i64, details: &EntryDetails) -> Result<Entry, EntryError> {
        let conn = self.conn.lock().unwrap();
        let result = conn.execute(
            "INSERT INTO entries \
             (account_id, label, category_id, date, type, amount, description, is_system, reconciled) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0)",
            rusqlite::params![
                account_id,
                details.label,
                details.category_id,
                details.date.as_str(),
                details.amount.kind.as_str(),
                details.amount.amount,
                details.description,
            ],
        );

        match result {
            Ok(_) => {
                let id = conn.last_insert_rowid();
                drop(conn);
                self.find(id)?
                    .ok_or_else(|| EntryError::Io("entry vanished after insert".to_owned()))
            }
            Err(e) => Err(map_write_error(e)),
        }
    }

    fn update(&self, id: i64, details: &EntryDetails) -> Result<Entry, EntryError> {
        let conn = self.conn.lock().unwrap();
        let result = conn.execute(
            "UPDATE entries SET label = ?1, category_id = ?2, date = ?3, type = ?4, amount = ?5, description = ?6 \
             WHERE id = ?7 AND is_system = 0",
            rusqlite::params![
                details.label,
                details.category_id,
                details.date.as_str(),
                details.amount.kind.as_str(),
                details.amount.amount,
                details.description,
                id,
            ],
        );

        match result {
            Ok(0) => Err(EntryError::SystemEntryReadOnly),
            Ok(_) => {
                drop(conn);
                self.find(id)?.ok_or(EntryError::NotFound)
            }
            Err(e) => Err(map_write_error(e)),
        }
    }

    fn delete(&self, id: i64) -> Result<(), EntryError> {
        let affected = self
            .conn
            .lock()
            .unwrap()
            .execute("DELETE FROM entries WHERE id = ?1 AND is_system = 0", [id])
            .map_err(io_err)?;

        if affected == 0 {
            return Err(EntryError::SystemEntryReadOnly);
        }
        Ok(())
    }

    fn set_reconciled(&self, id: i64, reconciled: bool) -> Result<Entry, EntryError> {
        let conn = self.conn.lock().unwrap();
        let affected = conn
            .execute(
                "UPDATE entries SET reconciled = ?1 WHERE id = ?2 AND is_system = 0",
                rusqlite::params![reconciled as i64, id],
            )
            .map_err(io_err)?;

        if affected == 0 {
            return Err(EntryError::SystemEntryReadOnly);
        }
        drop(conn);
        self.find(id)?.ok_or(EntryError::NotFound)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::account::{AccountDetails, AccountRepository};
    use crate::infra::account::SqliteAccountRepository;
    use crate::infra::db;

    fn details(created_date: &str, opening_balance: i64) -> AccountDetails {
        AccountDetails {
            name: "Compte courant".to_owned(),
            color: "#3b82f6".to_owned(),
            icon: "wallet".to_owned(),
            created_date: IsoDate::parse(created_date).unwrap(),
            opening_balance,
        }
    }

    fn fixture() -> (SharedConnection, i64) {
        let conn = db::migrated_in_memory_connection();
        let account = SqliteAccountRepository::new(conn.clone())
            .create(&details("2026-01-15", 100_000))
            .unwrap();
        (conn, account.id)
    }

    fn add_real_entry(
        conn: &SharedConnection,
        account_id: i64,
        date: &str,
        kind: &str,
        amount: i64,
    ) {
        conn.lock()
            .unwrap()
            .execute(
                "INSERT INTO entries (account_id, date, type, amount, is_system) VALUES (?1, ?2, ?3, ?4, 0)",
                rusqlite::params![account_id, date, kind, amount],
            )
            .unwrap();
    }

    fn add_categorized_entry(
        conn: &SharedConnection,
        account_id: i64,
        date: &str,
        category_id: i64,
    ) {
        conn.lock()
            .unwrap()
            .execute(
                "INSERT INTO entries (account_id, date, type, amount, is_system, category_id) \
                 VALUES (?1, ?2, 'DEBIT', 100, 0, ?3)",
                rusqlite::params![account_id, date, category_id],
            )
            .unwrap();
    }

    #[test]
    fn sum_by_account_signs_debits_negative_and_credits_positive() {
        let (conn, account_id) = fixture();
        add_real_entry(&conn, account_id, "2026-02-01", "DEBIT", 2_550);
        add_real_entry(&conn, account_id, "2026-02-03", "CREDIT", 1_000);
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(repo.sum_by_account(account_id).unwrap(), 98_450);
    }

    #[test]
    fn sum_by_account_is_zero_for_an_account_with_no_entries() {
        let (conn, _) = fixture();
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(repo.sum_by_account(404).unwrap(), 0);
    }

    #[test]
    fn last_entry_date_falls_back_to_the_system_entry() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(
            repo.last_entry_date(account_id)
                .unwrap()
                .map(|d| d.to_string()),
            Some("2026-01-15".to_owned())
        );
    }

    #[test]
    fn last_entry_date_returns_the_most_recent_entry() {
        let (conn, account_id) = fixture();
        add_real_entry(&conn, account_id, "2026-03-09", "DEBIT", 100);
        add_real_entry(&conn, account_id, "2026-02-28", "DEBIT", 100);
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(
            repo.last_entry_date(account_id)
                .unwrap()
                .map(|d| d.to_string()),
            Some("2026-03-09".to_owned())
        );
    }

    #[test]
    fn last_entry_date_is_none_for_an_account_with_no_entries() {
        let (conn, _) = fixture();
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(repo.last_entry_date(404).unwrap(), None);
    }

    #[test]
    fn exists_non_system_on_or_before_ignores_the_system_entry() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);

        let opening_date = IsoDate::parse("2026-01-15").unwrap();
        assert!(!repo
            .exists_non_system_on_or_before(account_id, &opening_date)
            .unwrap());
    }

    #[test]
    fn exists_non_system_on_or_before_matches_the_boundary_date_itself() {
        let (conn, account_id) = fixture();
        add_real_entry(&conn, account_id, "2026-02-01", "DEBIT", 100);
        let repo = SqliteEntryRepository::new(conn);

        let same_day = IsoDate::parse("2026-02-01").unwrap();
        let day_before = IsoDate::parse("2026-01-31").unwrap();

        assert!(repo
            .exists_non_system_on_or_before(account_id, &same_day)
            .unwrap());
        assert!(!repo
            .exists_non_system_on_or_before(account_id, &day_before)
            .unwrap());
    }

    #[test]
    fn count_non_system_by_account_excludes_the_system_entry() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn.clone());
        assert_eq!(repo.count_non_system_by_account(account_id).unwrap(), 0);

        add_real_entry(&conn, account_id, "2026-02-01", "DEBIT", 100);
        add_real_entry(&conn, account_id, "2026-02-02", "CREDIT", 100);

        assert_eq!(repo.count_non_system_by_account(account_id).unwrap(), 2);
    }

    #[test]
    fn count_by_category_counts_only_entries_tagged_with_that_category() {
        let (conn, account_id) = fixture();
        add_categorized_entry(&conn, account_id, "2026-02-01", 1);
        add_categorized_entry(&conn, account_id, "2026-02-02", 1);
        add_categorized_entry(&conn, account_id, "2026-02-03", 2);
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(repo.count_by_category(1).unwrap(), 2);
        assert_eq!(repo.count_by_category(2).unwrap(), 1);
    }

    #[test]
    fn an_entry_cannot_point_at_a_category_that_does_not_exist() {
        let (conn, account_id) = fixture();

        let orphan = conn.lock().unwrap().execute(
            "INSERT INTO entries (account_id, date, type, amount, is_system, category_id) \
             VALUES (?1, '2026-02-01', 'DEBIT', 100, 0, 404)",
            [account_id],
        );

        assert!(orphan.is_err(), "an unknown category should be rejected");
    }

    #[test]
    fn count_by_category_is_zero_for_a_category_no_entry_uses() {
        let (conn, _) = fixture();
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(repo.count_by_category(1).unwrap(), 0);
    }

    #[test]
    fn an_account_can_only_ever_have_one_system_entry() {
        let (conn, account_id) = fixture();

        let second = conn.lock().unwrap().execute(
            "INSERT INTO entries (account_id, date, type, amount, is_system) VALUES (?1, ?2, 'CREDIT', 1, 1)",
            rusqlite::params![account_id, "2026-01-16"],
        );

        assert!(second.is_err(), "a second system entry should be rejected");
    }

    fn entry_details(label: &str, date: &str, cents: i64) -> EntryDetails {
        EntryDetails {
            label: label.to_owned(),
            category_id: None,
            date: IsoDate::parse(date).unwrap(),
            amount: SignedCents::new(cents),
            description: String::new(),
        }
    }

    #[test]
    fn create_inserts_a_real_entry_and_returns_it() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);

        let created = repo
            .create(account_id, &entry_details("Courses", "2026-02-01", -2_550))
            .unwrap();

        assert_eq!(created.label, "Courses");
        assert_eq!(created.amount.kind, EntryKind::Debit);
        assert_eq!(created.amount.amount, 2_550);
        assert!(!created.is_system);
        assert!(!created.reconciled);
    }

    #[test]
    fn create_against_an_unknown_category_is_reported() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);

        let err = repo
            .create(
                account_id,
                &EntryDetails {
                    category_id: Some(404),
                    ..entry_details("Courses", "2026-02-01", -2_550)
                },
            )
            .unwrap_err();

        assert_eq!(err, EntryError::UnknownCategory);
    }

    #[test]
    fn find_returns_a_previously_created_entry() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);
        let created = repo
            .create(account_id, &entry_details("Courses", "2026-02-01", -2_550))
            .unwrap();

        let found = repo.find(created.id).unwrap().unwrap();

        assert_eq!(found, created);
    }

    #[test]
    fn find_returns_none_for_an_unknown_id() {
        let (conn, _) = fixture();
        let repo = SqliteEntryRepository::new(conn);

        assert!(repo.find(404).unwrap().is_none());
    }

    #[test]
    fn update_rewrites_every_editable_field() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);
        let created = repo
            .create(account_id, &entry_details("Courses", "2026-02-01", -2_550))
            .unwrap();

        let updated = repo
            .update(
                created.id,
                &entry_details("Restaurant", "2026-02-05", 4_200),
            )
            .unwrap();

        assert_eq!(updated.label, "Restaurant");
        assert_eq!(updated.date.as_str(), "2026-02-05");
        assert_eq!(updated.amount.kind, EntryKind::Credit);
        assert_eq!(updated.amount.amount, 4_200);
    }

    #[test]
    fn update_against_an_unknown_category_is_reported() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);
        let created = repo
            .create(account_id, &entry_details("Courses", "2026-02-01", -2_550))
            .unwrap();

        let err = repo
            .update(
                created.id,
                &EntryDetails {
                    category_id: Some(404),
                    ..entry_details("Courses", "2026-02-01", -2_550)
                },
            )
            .unwrap_err();

        assert_eq!(err, EntryError::UnknownCategory);
    }

    #[test]
    fn update_rejects_the_system_entry() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);
        let system = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    from: None,
                    to: None,
                    sort: SortDirection::Asc,
                    offset: 0,
                    limit: 10,
                },
            )
            .unwrap()
            .entries
            .into_iter()
            .find(|e| e.is_system)
            .unwrap();

        let err = repo
            .update(system.id, &entry_details("Hacked", "2026-02-01", 1))
            .unwrap_err();

        assert_eq!(err, EntryError::SystemEntryReadOnly);
    }

    #[test]
    fn delete_removes_a_real_entry() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);
        let created = repo
            .create(account_id, &entry_details("Courses", "2026-02-01", -2_550))
            .unwrap();

        repo.delete(created.id).unwrap();

        assert!(repo.find(created.id).unwrap().is_none());
    }

    #[test]
    fn delete_rejects_the_system_entry() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);
        let system = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    from: None,
                    to: None,
                    sort: SortDirection::Asc,
                    offset: 0,
                    limit: 10,
                },
            )
            .unwrap()
            .entries
            .into_iter()
            .find(|e| e.is_system)
            .unwrap();

        let err = repo.delete(system.id).unwrap_err();

        assert_eq!(err, EntryError::SystemEntryReadOnly);
    }

    #[test]
    fn set_reconciled_toggles_only_that_flag() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);
        let created = repo
            .create(account_id, &entry_details("Courses", "2026-02-01", -2_550))
            .unwrap();

        let toggled = repo.set_reconciled(created.id, true).unwrap();

        assert!(toggled.reconciled);
        assert_eq!(toggled.label, "Courses");
    }

    #[test]
    fn set_reconciled_rejects_the_system_entry() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);
        let system = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    from: None,
                    to: None,
                    sort: SortDirection::Asc,
                    offset: 0,
                    limit: 10,
                },
            )
            .unwrap()
            .entries
            .into_iter()
            .find(|e| e.is_system)
            .unwrap();

        let err = repo.set_reconciled(system.id, true).unwrap_err();

        assert_eq!(err, EntryError::SystemEntryReadOnly);
    }

    #[test]
    fn list_by_account_sorts_and_paginates_with_a_has_more_flag() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);
        for day in 1..=3 {
            repo.create(
                account_id,
                &entry_details("Entry", &format!("2026-02-{day:02}"), -100),
            )
            .unwrap();
        }

        let page = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    from: None,
                    to: None,
                    sort: SortDirection::Desc,
                    offset: 0,
                    limit: 2,
                },
            )
            .unwrap();

        // The system entry (2026-01-15) plus the 3 real entries: most recent
        // first is 02-03, 02-02.
        assert_eq!(page.entries.len(), 2);
        assert_eq!(page.entries[0].date.as_str(), "2026-02-03");
        assert_eq!(page.entries[1].date.as_str(), "2026-02-02");
        assert!(page.has_more);

        let last_page = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    from: None,
                    to: None,
                    sort: SortDirection::Desc,
                    offset: 2,
                    limit: 2,
                },
            )
            .unwrap();

        assert_eq!(last_page.entries.len(), 2);
        assert!(!last_page.has_more);
    }

    #[test]
    fn list_by_account_always_includes_the_system_entry_regardless_of_the_date_filter() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);
        repo.create(account_id, &entry_details("Entry", "2026-02-01", -100))
            .unwrap();

        let page = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    from: Some(IsoDate::parse("2026-02-01").unwrap()),
                    to: Some(IsoDate::parse("2026-02-28").unwrap()),
                    sort: SortDirection::Asc,
                    offset: 0,
                    limit: 10,
                },
            )
            .unwrap();

        assert!(
            page.entries.iter().any(|e| e.is_system),
            "the system entry (opened 2026-01-15) should still be present despite the filter"
        );
        assert_eq!(page.entries.len(), 2);
    }

    #[test]
    fn offset_for_date_lands_on_the_first_entry_at_or_before_the_target() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);
        for day in 1..=5 {
            repo.create(
                account_id,
                &entry_details("Entry", &format!("2026-02-{day:02}"), -100),
            )
            .unwrap();
        }

        // Desc order: system (01-15), 02-05, 02-04, 02-03, 02-02, 02-01.
        // Jumping to 02-03 should skip the 3 rows ahead of it.
        let offset = repo
            .offset_for_date(
                account_id,
                None,
                None,
                SortDirection::Desc,
                &IsoDate::parse("2026-02-03").unwrap(),
            )
            .unwrap();

        assert_eq!(offset, 2);

        let page = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    from: None,
                    to: None,
                    sort: SortDirection::Desc,
                    offset,
                    limit: 1,
                },
            )
            .unwrap();
        assert_eq!(page.entries[0].date.as_str(), "2026-02-03");
    }
}
