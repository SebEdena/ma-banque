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

/// `entries.amount` re-signed from its `type`, in cents — the SQL half of
/// the debit/credit rule `domain::entry::SignedCents` owns in Rust. One
/// constant so the aggregates below can't drift apart from each other, and
/// `sum_reconciled_up_to_matches_sum_by_account_when_nothing_is_filtered_out`
/// pins it against the Rust rule so the two halves can't drift either.
const SIGNED_AMOUNT_CENTS: &str = "CASE type WHEN 'DEBIT' THEN -amount ELSE amount END";

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

/// The `WHERE` fragment deciding which of an account's rows a filtered view
/// can see, plus its bound parameters — empty when nothing is filtered.
///
/// Shared by `list_by_account` and `offset_for_date` rather than spelled out
/// in each: an offset computed under a different predicate than the page it
/// indexes into points at the wrong row. The system entry is exempt from
/// every filter (`06-entries.md`), which is why the clauses are wrapped
/// rather than `AND`ed on directly.
fn visibility_predicate(
    from: Option<&IsoDate>,
    to: Option<&IsoDate>,
    unreconciled_only: bool,
) -> (String, Vec<Box<dyn ToSql>>) {
    let mut clauses: Vec<&str> = vec![];
    let mut params: Vec<Box<dyn ToSql>> = vec![];
    if let Some(from) = from {
        clauses.push("date >= ?");
        params.push(Box::new(from.as_str().to_owned()));
    }
    if let Some(to) = to {
        clauses.push("date <= ?");
        params.push(Box::new(to.as_str().to_owned()));
    }
    if unreconciled_only {
        clauses.push("reconciled = 0");
    }

    if clauses.is_empty() {
        return (String::new(), params);
    }
    (
        format!(" AND (is_system = 1 OR ({}))", clauses.join(" AND ")),
        params,
    )
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

    /// Summed in SQL rather than by fetching the rows first: an account can
    /// hold years of entries, and this produces one integer. `COALESCE`
    /// makes "no matching rows" a zero rather than a `NULL`.
    fn sum_reconciled_up_to(
        &self,
        account_id: i64,
        statement_date: &IsoDate,
    ) -> Result<i64, EntryError> {
        self.conn
            .lock()
            .unwrap()
            .query_row(
                &format!(
                    "SELECT COALESCE(SUM({SIGNED_AMOUNT_CENTS}), 0) FROM entries \
                     WHERE account_id = ?1 AND (reconciled = 1 OR is_system = 1) AND date <= ?2"
                ),
                rusqlite::params![account_id, statement_date.as_str()],
                |row| row.get(0),
            )
            .map_err(io_err)
    }

    fn count_unreconciled_by_account(&self, account_id: i64) -> Result<i64, EntryError> {
        self.conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM entries \
                 WHERE account_id = ?1 AND is_system = 0 AND reconciled = 0",
                [account_id],
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

        let (predicate, filter_params) = visibility_predicate(
            query.from.as_ref(),
            query.to.as_ref(),
            query.unreconciled_only,
        );

        let mut sql = format!("SELECT {ENTRY_COLUMNS} FROM entries WHERE account_id = ?");
        let mut params: Vec<Box<dyn ToSql>> = vec![Box::new(account_id)];
        sql.push_str(&predicate);
        params.extend(filter_params);
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
        unreconciled_only: bool,
        sort: SortDirection,
        target: &IsoDate,
    ) -> Result<i64, EntryError> {
        let (predicate, visibility_params) = visibility_predicate(from, to, unreconciled_only);

        let mut sql = String::from("SELECT COUNT(*) FROM entries WHERE account_id = ?");
        let mut params: Vec<Box<dyn ToSql>> = vec![Box::new(account_id)];
        sql.push_str(&predicate);
        params.extend(visibility_params);

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

    fn add_reconciled_entry(
        conn: &SharedConnection,
        account_id: i64,
        date: &str,
        kind: &str,
        amount: i64,
    ) {
        conn.lock()
            .unwrap()
            .execute(
                "INSERT INTO entries (account_id, date, type, amount, is_system, reconciled) \
                 VALUES (?1, ?2, ?3, ?4, 0, 1)",
                rusqlite::params![account_id, date, kind, amount],
            )
            .unwrap();
    }

    fn statement_date(date: &str) -> IsoDate {
        IsoDate::parse(date).unwrap()
    }

    #[test]
    fn sum_reconciled_up_to_counts_only_reconciled_entries() {
        let (conn, account_id) = fixture();
        add_reconciled_entry(&conn, account_id, "2026-02-01", "DEBIT", 2_550);
        add_real_entry(&conn, account_id, "2026-02-02", "DEBIT", 9_999);
        let repo = SqliteEntryRepository::new(conn);

        // 100_000 opening - 2_550 reconciled; the unticked 9_999 is ignored.
        assert_eq!(
            repo.sum_reconciled_up_to(account_id, &statement_date("2026-02-28"))
                .unwrap(),
            97_450
        );
    }

    #[test]
    fn sum_reconciled_up_to_excludes_reconciled_entries_after_the_statement_date() {
        let (conn, account_id) = fixture();
        add_reconciled_entry(&conn, account_id, "2026-02-01", "DEBIT", 2_550);
        add_reconciled_entry(&conn, account_id, "2026-03-01", "DEBIT", 5_000);
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(
            repo.sum_reconciled_up_to(account_id, &statement_date("2026-02-28"))
                .unwrap(),
            97_450
        );
    }

    #[test]
    fn sum_reconciled_up_to_includes_an_entry_dated_on_the_statement_date_itself() {
        let (conn, account_id) = fixture();
        add_reconciled_entry(&conn, account_id, "2026-02-28", "DEBIT", 2_550);
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(
            repo.sum_reconciled_up_to(account_id, &statement_date("2026-02-28"))
                .unwrap(),
            97_450
        );
        assert_eq!(
            repo.sum_reconciled_up_to(account_id, &statement_date("2026-02-27"))
                .unwrap(),
            100_000
        );
    }

    #[test]
    fn sum_reconciled_up_to_counts_the_untickable_system_entry() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn.clone());

        // The system entry is never `reconciled = 1` — `set_reconciled`
        // refuses it — yet the opening balance must be in the total.
        let system_reconciled: i64 = conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT reconciled FROM entries WHERE account_id = ?1 AND is_system = 1",
                [account_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(system_reconciled, 0);

        assert_eq!(
            repo.sum_reconciled_up_to(account_id, &statement_date("2026-02-28"))
                .unwrap(),
            100_000
        );
    }

    #[test]
    fn sum_reconciled_up_to_excludes_the_system_entry_dated_after_the_statement_date() {
        let (conn, account_id) = fixture();
        let repo = SqliteEntryRepository::new(conn);

        // Opened 2026-01-15, reconciling against a statement that predates
        // the account: nothing is in scope, not even the opening balance.
        assert_eq!(
            repo.sum_reconciled_up_to(account_id, &statement_date("2026-01-14"))
                .unwrap(),
            0
        );
    }

    #[test]
    fn sum_reconciled_up_to_signs_debits_negative_and_credits_positive() {
        let (conn, account_id) = fixture();
        add_reconciled_entry(&conn, account_id, "2026-02-01", "DEBIT", 2_550);
        add_reconciled_entry(&conn, account_id, "2026-02-02", "CREDIT", 1_000);
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(
            repo.sum_reconciled_up_to(account_id, &statement_date("2026-02-28"))
                .unwrap(),
            98_450
        );
    }

    #[test]
    fn sum_reconciled_up_to_nets_many_debits_against_many_credits() {
        let (conn, account_id) = fixture();
        for (date, kind, amount) in [
            ("2026-02-01", "DEBIT", 2_550),
            ("2026-02-02", "CREDIT", 1_000),
            ("2026-02-03", "DEBIT", 750),
            ("2026-02-04", "CREDIT", 33_333),
            ("2026-02-05", "DEBIT", 1),
        ] {
            add_reconciled_entry(&conn, account_id, date, kind, amount);
        }
        let repo = SqliteEntryRepository::new(conn);

        // 100_000 - 2_550 + 1_000 - 750 + 33_333 - 1: a sum over absolute
        // values would give 137_634, and double-counting any row would miss
        // this figure too.
        assert_eq!(
            repo.sum_reconciled_up_to(account_id, &statement_date("2026-02-28"))
                .unwrap(),
            131_032
        );
    }

    #[test]
    fn sum_reconciled_up_to_can_go_negative_when_debits_outweigh_the_opening_balance() {
        let (conn, account_id) = fixture();
        add_reconciled_entry(&conn, account_id, "2026-02-01", "DEBIT", 150_000);
        add_reconciled_entry(&conn, account_id, "2026-02-02", "CREDIT", 10_000);
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(
            repo.sum_reconciled_up_to(account_id, &statement_date("2026-02-28"))
                .unwrap(),
            -40_000
        );
    }

    #[test]
    fn sum_reconciled_up_to_stays_exact_across_amounts_that_would_drift_as_floats() {
        let (conn, account_id) = fixture();
        // 0.10 + 0.20 is the canonical float-drift pair; a thousand of them
        // would compound it. In integer cents the total is exact.
        for _ in 0..1_000 {
            add_reconciled_entry(&conn, account_id, "2026-02-01", "CREDIT", 10);
            add_reconciled_entry(&conn, account_id, "2026-02-01", "CREDIT", 20);
        }
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(
            repo.sum_reconciled_up_to(account_id, &statement_date("2026-02-28"))
                .unwrap(),
            100_000 + 30_000
        );
    }

    #[test]
    fn sum_reconciled_up_to_returns_just_the_opening_balance_when_nothing_is_ticked() {
        let (conn, account_id) = fixture();
        add_real_entry(&conn, account_id, "2026-02-01", "DEBIT", 2_550);
        add_real_entry(&conn, account_id, "2026-02-02", "CREDIT", 1_000);
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(
            repo.sum_reconciled_up_to(account_id, &statement_date("2026-02-28"))
                .unwrap(),
            100_000
        );
    }

    #[test]
    fn sum_reconciled_up_to_is_zero_for_an_unknown_account() {
        let (conn, _) = fixture();
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(
            repo.sum_reconciled_up_to(404, &statement_date("2026-02-28"))
                .unwrap(),
            0
        );
    }

    #[test]
    fn sum_reconciled_up_to_matches_sum_by_account_when_nothing_is_filtered_out() {
        let (conn, account_id) = fixture();
        add_reconciled_entry(&conn, account_id, "2026-02-01", "DEBIT", 2_550);
        add_reconciled_entry(&conn, account_id, "2026-02-02", "CREDIT", 1_000);
        add_reconciled_entry(&conn, account_id, "2026-02-03", "DEBIT", 87_654);
        let repo = SqliteEntryRepository::new(conn);

        // The SQL sign rule here and `domain::entry::SignedCents`' Rust one
        // must agree; with every entry ticked and in scope, both sums cover
        // the same rows and any divergence shows up as a mismatch.
        assert_eq!(
            repo.sum_reconciled_up_to(account_id, &statement_date("2026-12-31"))
                .unwrap(),
            repo.sum_by_account(account_id).unwrap()
        );
    }

    #[test]
    fn count_unreconciled_by_account_counts_only_unticked_real_entries() {
        let (conn, account_id) = fixture();
        add_real_entry(&conn, account_id, "2026-02-01", "DEBIT", 100);
        add_real_entry(&conn, account_id, "2026-02-02", "CREDIT", 100);
        add_reconciled_entry(&conn, account_id, "2026-02-03", "DEBIT", 100);
        let repo = SqliteEntryRepository::new(conn);

        // The system entry is permanently unticked and must not be counted.
        assert_eq!(repo.count_unreconciled_by_account(account_id).unwrap(), 2);
    }

    #[test]
    fn count_unreconciled_by_account_is_zero_once_every_real_entry_is_ticked() {
        let (conn, account_id) = fixture();
        add_reconciled_entry(&conn, account_id, "2026-02-01", "DEBIT", 100);
        add_reconciled_entry(&conn, account_id, "2026-02-02", "CREDIT", 100);
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(repo.count_unreconciled_by_account(account_id).unwrap(), 0);
    }

    #[test]
    fn count_unreconciled_by_account_ignores_other_accounts() {
        let (conn, account_id) = fixture();
        let other = SqliteAccountRepository::new(conn.clone())
            .create(&AccountDetails {
                name: "Livret A".to_owned(),
                ..details("2026-01-15", 0)
            })
            .unwrap();
        add_real_entry(&conn, other.id, "2026-02-01", "DEBIT", 100);
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(repo.count_unreconciled_by_account(account_id).unwrap(), 0);
        assert_eq!(repo.count_unreconciled_by_account(other.id).unwrap(), 1);
    }

    #[test]
    fn sum_reconciled_up_to_ignores_other_accounts() {
        let (conn, account_id) = fixture();
        let other = SqliteAccountRepository::new(conn.clone())
            .create(&AccountDetails {
                name: "Livret A".to_owned(),
                ..details("2026-01-15", 500_000)
            })
            .unwrap();
        add_reconciled_entry(&conn, other.id, "2026-02-01", "CREDIT", 12_345);
        let repo = SqliteEntryRepository::new(conn);

        assert_eq!(
            repo.sum_reconciled_up_to(account_id, &statement_date("2026-02-28"))
                .unwrap(),
            100_000
        );
        assert_eq!(
            repo.sum_reconciled_up_to(other.id, &statement_date("2026-02-28"))
                .unwrap(),
            512_345
        );
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
                    unreconciled_only: false,
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
                    unreconciled_only: false,
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
                    unreconciled_only: false,
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
                    unreconciled_only: false,
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
                    unreconciled_only: false,
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
                    unreconciled_only: false,
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
                false,
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
                    unreconciled_only: false,
                    sort: SortDirection::Desc,
                    offset,
                    limit: 1,
                },
            )
            .unwrap();
        assert_eq!(page.entries[0].date.as_str(), "2026-02-03");
    }

    /// The whole account in one page, unfiltered — the base the
    /// `unreconciled_only` tests vary a single field of.
    fn base_query(sort: SortDirection) -> EntryListQuery {
        EntryListQuery {
            from: None,
            to: None,
            unreconciled_only: false,
            sort,
            offset: 0,
            limit: 100,
        }
    }

    fn signed_total(page: &EntryPage) -> i64 {
        entry::balance(page.entries.iter().map(|e| e.amount))
    }

    /// 50 reconciled entries sitting ahead of 10 unreconciled ones, so a
    /// first page of 50 under the filter can only come back full if the
    /// database applied the predicate before the offset/limit.
    fn reconciled_backlog_fixture() -> (SharedConnection, i64) {
        let (conn, account_id) = fixture();
        for _ in 0..50 {
            add_reconciled_entry(&conn, account_id, "2026-02-01", "DEBIT", 100);
        }
        for day in 1..=10 {
            add_real_entry(
                &conn,
                account_id,
                &format!("2026-03-{day:02}"),
                "DEBIT",
                day * 100,
            );
        }
        (conn, account_id)
    }

    #[test]
    fn list_by_account_excludes_reconciled_entries_when_unreconciled_only_is_set() {
        let (conn, account_id) = fixture();
        add_reconciled_entry(&conn, account_id, "2026-02-01", "DEBIT", 2_550);
        add_real_entry(&conn, account_id, "2026-02-02", "DEBIT", 1_000);
        let repo = SqliteEntryRepository::new(conn);

        let page = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    unreconciled_only: true,
                    ..base_query(SortDirection::Asc)
                },
            )
            .unwrap();

        let dates: Vec<&str> = page.entries.iter().map(|e| e.date.as_str()).collect();
        assert_eq!(dates, vec!["2026-01-15", "2026-02-02"]);
        // 100_000 opening - 1_000 unreconciled; the ticked 2_550 is gone.
        assert_eq!(signed_total(&page), 99_000);
    }

    #[test]
    fn list_by_account_includes_the_system_entry_when_unreconciled_only_is_set() {
        let (conn, account_id) = fixture();
        add_reconciled_entry(&conn, account_id, "2026-02-01", "DEBIT", 2_550);
        let repo = SqliteEntryRepository::new(conn);

        let page = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    unreconciled_only: true,
                    ..base_query(SortDirection::Asc)
                },
            )
            .unwrap();

        assert_eq!(page.entries.len(), 1);
        assert!(
            page.entries[0].is_system,
            "the opening-balance row is exempt from the filter, as it is from the date range"
        );
        assert_eq!(signed_total(&page), 100_000);
    }

    #[test]
    fn unreconciled_only_composes_with_an_active_date_range() {
        let (conn, account_id) = fixture();
        add_real_entry(&conn, account_id, "2026-02-01", "DEBIT", 100);
        add_reconciled_entry(&conn, account_id, "2026-03-04", "DEBIT", 400);
        add_real_entry(&conn, account_id, "2026-03-05", "DEBIT", 500);
        add_real_entry(&conn, account_id, "2026-04-01", "DEBIT", 900);
        let repo = SqliteEntryRepository::new(conn);

        let page = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    from: Some(IsoDate::parse("2026-03-01").unwrap()),
                    to: Some(IsoDate::parse("2026-03-31").unwrap()),
                    unreconciled_only: true,
                    ..base_query(SortDirection::Asc)
                },
            )
            .unwrap();

        // Both predicates hold at once: out-of-range rows and the ticked
        // in-range row are gone, the system entry is exempt from both.
        let dates: Vec<&str> = page.entries.iter().map(|e| e.date.as_str()).collect();
        assert_eq!(dates, vec!["2026-01-15", "2026-03-05"]);
        assert_eq!(signed_total(&page), 99_500);
    }

    #[test]
    fn unreconciled_only_selects_the_same_rows_in_both_sort_directions() {
        let (conn, account_id) = reconciled_backlog_fixture();
        let repo = SqliteEntryRepository::new(conn);

        let ascending = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    unreconciled_only: true,
                    ..base_query(SortDirection::Asc)
                },
            )
            .unwrap();
        let descending = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    unreconciled_only: true,
                    ..base_query(SortDirection::Desc)
                },
            )
            .unwrap();

        let ascending_dates: Vec<&str> =
            ascending.entries.iter().map(|e| e.date.as_str()).collect();
        let mut descending_dates: Vec<&str> =
            descending.entries.iter().map(|e| e.date.as_str()).collect();
        descending_dates.reverse();
        assert_eq!(ascending_dates, descending_dates);
        // 100_000 opening - (100 + 200 + ... + 1_000).
        assert_eq!(signed_total(&ascending), 94_500);
        assert_eq!(signed_total(&descending), signed_total(&ascending));
    }

    #[test]
    fn a_full_page_of_unreconciled_rows_survives_a_backlog_of_reconciled_ones() {
        let (conn, account_id) = fixture();
        for _ in 0..50 {
            add_reconciled_entry(&conn, account_id, "2026-02-01", "DEBIT", 100);
        }
        for _ in 0..60 {
            add_real_entry(&conn, account_id, "2026-03-01", "DEBIT", 100);
        }
        let repo = SqliteEntryRepository::new(conn);

        let page = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    unreconciled_only: true,
                    limit: 50,
                    ..base_query(SortDirection::Asc)
                },
            )
            .unwrap();

        // A page is a page of *matching* rows: the 50 ticked February rows
        // sit ahead of every unticked one, so a filter applied after the
        // page had been fetched would have rendered an empty list here.
        assert_eq!(page.entries.len(), 50);
        assert!(page.has_more, "11 matching rows remain behind this page");
        assert!(page.entries.iter().all(|e| e.is_system || !e.reconciled));
        // The system entry plus the first 49 unreconciled debits.
        assert_eq!(signed_total(&page), 95_100);
    }

    #[test]
    fn unreconciled_only_offsets_count_matching_rows_only() {
        let (conn, account_id) = reconciled_backlog_fixture();
        let repo = SqliteEntryRepository::new(conn);

        let page = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    unreconciled_only: true,
                    offset: 5,
                    limit: 4,
                    ..base_query(SortDirection::Asc)
                },
            )
            .unwrap();

        // Matching rows ascending are the system entry then 03-01..03-10, so
        // offset 5 is 03-05. Offsetting into the unfiltered 61 rows would
        // still be inside the reconciled February block.
        let dates: Vec<&str> = page.entries.iter().map(|e| e.date.as_str()).collect();
        assert_eq!(
            dates,
            vec!["2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08"]
        );
        assert_eq!(signed_total(&page), -2_600);
        // 11 matching rows in total, so a 5+4 window leaves two behind.
        assert!(page.has_more);

        // Descending, the same window walks the matching rows the other way:
        // 03-10 first, so offset 5 is 03-05 again.
        let descending = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    unreconciled_only: true,
                    offset: 5,
                    limit: 4,
                    ..base_query(SortDirection::Desc)
                },
            )
            .unwrap();
        let descending_dates: Vec<&str> =
            descending.entries.iter().map(|e| e.date.as_str()).collect();
        assert_eq!(
            descending_dates,
            vec!["2026-03-05", "2026-03-04", "2026-03-03", "2026-03-02"]
        );
        assert_eq!(signed_total(&descending), -1_400);
        assert!(descending.has_more);

        let past_the_end = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    unreconciled_only: true,
                    offset: 11,
                    limit: 4,
                    ..base_query(SortDirection::Asc)
                },
            )
            .unwrap();
        assert!(past_the_end.entries.is_empty());
        assert!(!past_the_end.has_more);
    }

    #[test]
    fn clearing_unreconciled_only_returns_the_unfiltered_page_again() {
        let (conn, account_id) = reconciled_backlog_fixture();
        let repo = SqliteEntryRepository::new(conn);

        let before = repo
            .list_by_account(account_id, &base_query(SortDirection::Asc))
            .unwrap();
        repo.list_by_account(
            account_id,
            &EntryListQuery {
                unreconciled_only: true,
                ..base_query(SortDirection::Asc)
            },
        )
        .unwrap();
        let after = repo
            .list_by_account(account_id, &base_query(SortDirection::Asc))
            .unwrap();

        assert_eq!(before, after);
        assert_eq!(after.entries.len(), 61);
        // 100_000 opening - 50 * 100 reconciled - 5_500 unreconciled.
        assert_eq!(signed_total(&after), 89_500);
    }

    /// System (01-15), reconciled 02-01, unreconciled 02-02, reconciled
    /// 02-03, unreconciled 02-04 — so every offset differs under the filter.
    fn alternating_fixture() -> (SharedConnection, i64) {
        let (conn, account_id) = fixture();
        add_reconciled_entry(&conn, account_id, "2026-02-01", "DEBIT", 100);
        add_real_entry(&conn, account_id, "2026-02-02", "DEBIT", 200);
        add_reconciled_entry(&conn, account_id, "2026-02-03", "DEBIT", 300);
        add_real_entry(&conn, account_id, "2026-02-04", "DEBIT", 400);
        (conn, account_id)
    }

    #[test]
    fn offset_for_date_applies_the_unreconciled_only_predicate_ascending() {
        let (conn, account_id) = alternating_fixture();
        let repo = SqliteEntryRepository::new(conn);
        let target = IsoDate::parse("2026-02-04").unwrap();

        let offset = repo
            .offset_for_date(account_id, None, None, true, SortDirection::Asc, &target)
            .unwrap();

        // Only the system entry and 02-02 match ahead of the target; the
        // unfiltered count would have been 4.
        assert_eq!(offset, 2);
        let page = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    unreconciled_only: true,
                    offset,
                    limit: 1,
                    ..base_query(SortDirection::Asc)
                },
            )
            .unwrap();
        assert_eq!(page.entries[0].date.as_str(), "2026-02-04");
    }

    #[test]
    fn offset_for_date_applies_the_unreconciled_only_predicate_descending() {
        let (conn, account_id) = alternating_fixture();
        let repo = SqliteEntryRepository::new(conn);
        let target = IsoDate::parse("2026-02-02").unwrap();

        let offset = repo
            .offset_for_date(account_id, None, None, true, SortDirection::Desc, &target)
            .unwrap();

        // Descending, only 02-04 matches ahead of the target; the unfiltered
        // count would have been 2.
        assert_eq!(offset, 1);
        let page = repo
            .list_by_account(
                account_id,
                &EntryListQuery {
                    unreconciled_only: true,
                    offset,
                    limit: 1,
                    ..base_query(SortDirection::Desc)
                },
            )
            .unwrap();
        assert_eq!(page.entries[0].date.as_str(), "2026-02-02");
    }
}
