//! SQLite access to the `entries` table (see
//! `migrations/0004_create_entries.sql`).
//!
//! The SQL lives in free functions over a plain `&Connection` so that
//! `infra::account` can run the account and system-entry writes inside one
//! transaction (a `Transaction` derefs to `Connection`) without duplicating
//! any of it — the two repositories share one connection, so a use case
//! spanning both could never hold a transaction of its own.

use rusqlite::{Connection, OptionalExtension};

use crate::domain::date::IsoDate;
use crate::domain::entry::{
    self, EntryError, EntryKind, EntryRepository, SignedCents, SystemEntry,
};
use crate::infra::db::SharedConnection;

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

impl EntryRepository for SqliteEntryRepository {
    /// Sums in Rust rather than in SQL so the debit/credit sign rule has one
    /// home — `domain::entry::balance` — instead of a `CASE` expression here
    /// that could drift from it.
    fn sum_by_account(&self, account_id: i64) -> Result<i64, EntryError> {
        let conn = self.conn.lock().unwrap();
        let mut statement = conn
            .prepare("SELECT type, amount FROM entries WHERE account_id = ?1")
            .map_err(io_err)?;

        let rows = statement
            .query_map([account_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(io_err)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(io_err)?;

        let amounts = rows
            .into_iter()
            .map(|(kind, amount)| {
                Ok(SignedCents {
                    kind: EntryKind::parse(&kind)?,
                    amount,
                })
            })
            .collect::<Result<Vec<_>, EntryError>>()?;

        Ok(entry::balance(amounts))
    }

    fn last_entry_date(&self, account_id: i64) -> Result<Option<IsoDate>, EntryError> {
        let stored: Option<String> = self
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT MAX(date) FROM entries WHERE account_id = ?1",
                [account_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(io_err)?
            .flatten();

        stored
            .map(|raw| {
                IsoDate::parse(&raw).map_err(|e| EntryError::InvalidStoredValue(e.to_string()))
            })
            .transpose()
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
}
