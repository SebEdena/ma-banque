//! SQLite-backed implementation of `AccountRepository`, against the
//! `accounts` table (see `migrations/0003_create_accounts.sql`).
//!
//! Create/update/delete each wrap their account write and the matching
//! system-entry write (`infra::entry`) in one transaction, which is what
//! makes the trait's atomicity guarantee real.

use rusqlite::{Connection, OptionalExtension, Row};

use crate::domain::account::{Account, AccountDetails, AccountError, AccountRepository};
use crate::domain::date::IsoDate;
use crate::infra::collation::FRENCH_NOCASE;
use crate::infra::db::SharedConnection;
use crate::infra::entry;

const COLUMNS: &str =
    "id, name, color, icon, created_date, opening_balance, archived, last_viewed_date";

pub struct SqliteAccountRepository {
    conn: SharedConnection,
}

impl SqliteAccountRepository {
    pub fn new(conn: SharedConnection) -> Self {
        Self { conn }
    }
}

fn io_err<E: std::fmt::Display>(e: E) -> AccountError {
    AccountError::Io(e.to_string())
}

fn parse_stored_date(raw: String) -> Result<IsoDate, AccountError> {
    IsoDate::parse(&raw).map_err(|e| AccountError::InvalidDate(e.to_string()))
}

/// The outer `Result` is SQLite's (the row couldn't be read at all); the
/// inner one is ours (the row was read but holds a value the domain rejects).
fn to_account(row: &Row<'_>) -> rusqlite::Result<Result<Account, AccountError>> {
    let id = row.get(0)?;
    let name = row.get(1)?;
    let color = row.get(2)?;
    let icon = row.get(3)?;
    let created_date: String = row.get(4)?;
    let opening_balance = row.get(5)?;
    let archived = row.get(6)?;
    let last_viewed_date: Option<String> = row.get(7)?;

    Ok(Ok(Account {
        id,
        name,
        color,
        icon,
        created_date: match parse_stored_date(created_date) {
            Ok(date) => date,
            Err(err) => return Ok(Err(err)),
        },
        opening_balance,
        archived,
        last_viewed_date: match last_viewed_date.map(parse_stored_date).transpose() {
            Ok(date) => date,
            Err(err) => return Ok(Err(err)),
        },
    }))
}

fn find_in(conn: &Connection, id: i64) -> Result<Option<Account>, AccountError> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM accounts WHERE id = ?1"),
        [id],
        to_account,
    )
    .optional()
    .map_err(io_err)?
    .transpose()
}

fn write_details(conn: &Connection, id: i64, details: &AccountDetails) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE accounts SET name = ?1, color = ?2, icon = ?3, created_date = ?4, opening_balance = ?5 \
         WHERE id = ?6",
        rusqlite::params![
            details.name,
            details.color,
            details.icon,
            details.created_date.as_str(),
            details.opening_balance,
            id,
        ],
    )
}

impl AccountRepository for SqliteAccountRepository {
    fn create(&self, details: &AccountDetails) -> Result<Account, AccountError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(io_err)?;

        tx.execute(
            "INSERT INTO accounts (name, color, icon, created_date, opening_balance, archived) \
             VALUES (?1, ?2, ?3, ?4, ?5, 0)",
            rusqlite::params![
                details.name,
                details.color,
                details.icon,
                details.created_date.as_str(),
                details.opening_balance,
            ],
        )
        .map_err(io_err)?;

        let id = tx.last_insert_rowid();
        entry::insert_system_entry(&tx, id, &details.system_entry()).map_err(io_err)?;

        let account = find_in(&tx, id)?.ok_or(AccountError::NotFound)?;
        tx.commit().map_err(io_err)?;

        Ok(account)
    }

    fn update(&self, id: i64, details: &AccountDetails) -> Result<Account, AccountError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(io_err)?;

        if write_details(&tx, id, details).map_err(io_err)? == 0 {
            return Err(AccountError::NotFound);
        }
        entry::update_system_entry_date_and_amount(&tx, id, &details.system_entry())
            .map_err(io_err)?;

        let account = find_in(&tx, id)?.ok_or(AccountError::NotFound)?;
        tx.commit().map_err(io_err)?;

        Ok(account)
    }

    fn set_archived(&self, id: i64, archived: bool) -> Result<Account, AccountError> {
        let conn = self.conn.lock().unwrap();

        let changed = conn
            .execute(
                "UPDATE accounts SET archived = ?1 WHERE id = ?2",
                rusqlite::params![archived, id],
            )
            .map_err(io_err)?;
        if changed == 0 {
            return Err(AccountError::NotFound);
        }

        find_in(&conn, id)?.ok_or(AccountError::NotFound)
    }

    fn delete(&self, id: i64) -> Result<(), AccountError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(io_err)?;

        entry::delete_by_account(&tx, id).map_err(io_err)?;
        if tx
            .execute("DELETE FROM accounts WHERE id = ?1", [id])
            .map_err(io_err)?
            == 0
        {
            return Err(AccountError::NotFound);
        }

        tx.commit().map_err(io_err)
    }

    fn find(&self, id: i64) -> Result<Option<Account>, AccountError> {
        find_in(&self.conn.lock().unwrap(), id)
    }

    fn list(&self, archived: bool) -> Result<Vec<Account>, AccountError> {
        let conn = self.conn.lock().unwrap();
        let mut statement = conn
            .prepare(&format!(
                "SELECT {COLUMNS} FROM accounts WHERE archived = ?1 \
                 ORDER BY name COLLATE {FRENCH_NOCASE}, id"
            ))
            .map_err(io_err)?;

        let rows = statement
            .query_map([archived], to_account)
            .map_err(io_err)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(io_err)?;

        rows.into_iter().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::entry::{EntryRepository, SystemEntry};
    use crate::infra::db;
    use crate::infra::entry::SqliteEntryRepository;

    fn details(name: &str, created_date: &str, opening_balance: i64) -> AccountDetails {
        AccountDetails {
            name: name.to_owned(),
            color: "#3b82f6".to_owned(),
            icon: "wallet".to_owned(),
            created_date: IsoDate::parse(created_date).unwrap(),
            opening_balance,
        }
    }

    fn system_entry_of(conn: &SharedConnection, account_id: i64) -> SystemEntry {
        conn.lock()
            .unwrap()
            .query_row(
                "SELECT date, type, amount FROM entries WHERE account_id = ?1 AND is_system = 1",
                [account_id],
                |row| {
                    let date: String = row.get(0)?;
                    let kind: String = row.get(1)?;
                    let amount: i64 = row.get(2)?;
                    Ok(SystemEntry {
                        date: IsoDate::parse(&date).unwrap(),
                        amount: crate::domain::entry::SignedCents {
                            kind: crate::domain::entry::EntryKind::parse(&kind).unwrap(),
                            amount,
                        },
                    })
                },
            )
            .expect("account should have a system entry")
    }

    #[test]
    fn create_round_trips_every_field() {
        let conn = db::migrated_in_memory_connection();
        let repo = SqliteAccountRepository::new(conn);

        let created = repo
            .create(&details("Livret A", "2026-01-15", 123_456))
            .unwrap();

        let found = repo.find(created.id).unwrap().unwrap();
        assert_eq!(found, created);
        assert_eq!(found.name, "Livret A");
        assert_eq!(found.color, "#3b82f6");
        assert_eq!(found.icon, "wallet");
        assert_eq!(found.created_date.as_str(), "2026-01-15");
        assert_eq!(found.opening_balance, 123_456);
        assert!(!found.archived);
        assert_eq!(found.last_viewed_date, None);
    }

    #[test]
    fn create_writes_the_system_entry_in_the_same_transaction() {
        let conn = db::migrated_in_memory_connection();
        let repo = SqliteAccountRepository::new(conn.clone());

        let created = repo
            .create(&details("Livret A", "2026-01-15", -25_000))
            .unwrap();

        let entry = system_entry_of(&conn, created.id);
        assert_eq!(entry.date.as_str(), "2026-01-15");
        assert_eq!(entry.amount.to_cents(), -25_000);
        assert_eq!(
            SqliteEntryRepository::new(conn)
                .sum_by_account(created.id)
                .unwrap(),
            -25_000
        );
    }

    #[test]
    fn update_rewrites_the_account_and_re_dates_its_system_entry() {
        let conn = db::migrated_in_memory_connection();
        let repo = SqliteAccountRepository::new(conn.clone());
        let created = repo
            .create(&details("Livret A", "2026-01-15", 100_000))
            .unwrap();

        let updated = repo
            .update(created.id, &details("Compte joint", "2026-01-01", -5_000))
            .unwrap();

        assert_eq!(updated.name, "Compte joint");
        assert_eq!(updated.created_date.as_str(), "2026-01-01");
        assert_eq!(updated.opening_balance, -5_000);

        let entry = system_entry_of(&conn, created.id);
        assert_eq!(entry.date.as_str(), "2026-01-01");
        assert_eq!(entry.amount.to_cents(), -5_000);
    }

    #[test]
    fn update_reports_an_unknown_account_as_missing() {
        let conn = db::migrated_in_memory_connection();
        let repo = SqliteAccountRepository::new(conn);

        let err = repo
            .update(404, &details("Livret A", "2026-01-15", 0))
            .unwrap_err();

        assert_eq!(err, AccountError::NotFound);
    }

    #[test]
    fn set_archived_moves_the_account_between_the_two_lists() {
        let conn = db::migrated_in_memory_connection();
        let repo = SqliteAccountRepository::new(conn);
        let created = repo.create(&details("Livret A", "2026-01-15", 0)).unwrap();

        assert_eq!(repo.list(false).unwrap().len(), 1);
        assert!(repo.list(true).unwrap().is_empty());

        assert!(repo.set_archived(created.id, true).unwrap().archived);
        assert!(repo.list(false).unwrap().is_empty());
        assert_eq!(repo.list(true).unwrap().len(), 1);

        assert!(!repo.set_archived(created.id, false).unwrap().archived);
        assert_eq!(repo.list(false).unwrap().len(), 1);
    }

    #[test]
    fn set_archived_reports_an_unknown_account_as_missing() {
        let conn = db::migrated_in_memory_connection();
        let repo = SqliteAccountRepository::new(conn);

        assert_eq!(
            repo.set_archived(404, true).unwrap_err(),
            AccountError::NotFound
        );
    }

    #[test]
    fn delete_removes_the_account_and_its_entries() {
        let conn = db::migrated_in_memory_connection();
        let repo = SqliteAccountRepository::new(conn.clone());
        let created = repo
            .create(&details("Livret A", "2026-01-15", 100_000))
            .unwrap();

        repo.delete(created.id).unwrap();

        assert_eq!(repo.find(created.id).unwrap(), None);
        let remaining: i64 = conn
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM entries", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 0);
    }

    #[test]
    fn delete_reports_an_unknown_account_as_missing() {
        let conn = db::migrated_in_memory_connection();
        let repo = SqliteAccountRepository::new(conn);

        assert_eq!(repo.delete(404).unwrap_err(), AccountError::NotFound);
    }

    #[test]
    fn list_is_ordered_by_name_ignoring_case_and_accents() {
        let conn = db::migrated_in_memory_connection();
        let repo = SqliteAccountRepository::new(conn);
        repo.create(&details("livret b", "2026-01-15", 0)).unwrap();
        repo.create(&details("Compte courant", "2026-01-15", 0))
            .unwrap();
        repo.create(&details("Épargne Projet", "2026-01-15", 0))
            .unwrap();
        repo.create(&details("Livret A", "2026-01-15", 0)).unwrap();

        let names: Vec<_> = repo
            .list(false)
            .unwrap()
            .into_iter()
            .map(|a| a.name)
            .collect();

        assert_eq!(
            names,
            ["Compte courant", "Épargne Projet", "Livret A", "livret b"]
        );
    }

    #[test]
    fn find_returns_none_for_an_unknown_account() {
        let conn = db::migrated_in_memory_connection();
        let repo = SqliteAccountRepository::new(conn);

        assert_eq!(repo.find(404).unwrap(), None);
    }
}
