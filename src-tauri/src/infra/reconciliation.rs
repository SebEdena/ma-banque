//! SQLite access to the two reconciliation columns on `accounts` (see
//! `migrations/0007_accounts_reconciliation.sql`).
//!
//! A second module reading `accounts` alongside `infra::account` is the
//! established shape here, not a new one — `infra::entry` already coexists
//! with it over `entries`. Keeping these two columns out of
//! `SqliteAccountRepository` is what leaves the settings modal's
//! `AccountDetails` contract untouched by a feature it doesn't present.

use rusqlite::OptionalExtension;

use crate::domain::date::IsoDate;
use crate::domain::reconciliation::{
    ReconciliationError, ReconciliationRepository, ReconciliationSettings,
};
use crate::infra::db::SharedConnection;

pub struct SqliteReconciliationRepository {
    conn: SharedConnection,
}

impl SqliteReconciliationRepository {
    pub fn new(conn: SharedConnection) -> Self {
        Self { conn }
    }

    fn set_column(
        &self,
        column_sql: &str,
        value: &dyn rusqlite::ToSql,
        account_id: i64,
    ) -> Result<(), ReconciliationError> {
        let changed = self
            .conn
            .lock()
            .unwrap()
            .execute(column_sql, rusqlite::params![value, account_id])
            .map_err(io_err)?;

        if changed == 0 {
            return Err(ReconciliationError::UnknownAccount);
        }
        Ok(())
    }
}

fn io_err<E: std::fmt::Display>(e: E) -> ReconciliationError {
    ReconciliationError::Io(e.to_string())
}

impl ReconciliationRepository for SqliteReconciliationRepository {
    fn find_settings(
        &self,
        account_id: i64,
    ) -> Result<Option<ReconciliationSettings>, ReconciliationError> {
        let row: Option<(Option<i64>, Option<String>)> = self
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT bank_balance, statement_date FROM accounts WHERE id = ?1",
                [account_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(io_err)?;

        row.map(|(bank_balance, statement_date)| {
            Ok(ReconciliationSettings {
                bank_balance,
                statement_date: statement_date
                    .as_deref()
                    .map(IsoDate::parse)
                    .transpose()
                    .map_err(|e| ReconciliationError::InvalidDate(e.to_string()))?,
            })
        })
        .transpose()
    }

    fn set_bank_balance(
        &self,
        account_id: i64,
        bank_balance: i64,
    ) -> Result<(), ReconciliationError> {
        self.set_column(
            "UPDATE accounts SET bank_balance = ?1 WHERE id = ?2",
            &bank_balance,
            account_id,
        )
    }

    fn set_statement_date(
        &self,
        account_id: i64,
        statement_date: &IsoDate,
    ) -> Result<(), ReconciliationError> {
        self.set_column(
            "UPDATE accounts SET statement_date = ?1 WHERE id = ?2",
            &statement_date.as_str(),
            account_id,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::account::{AccountDetails, AccountRepository};
    use crate::infra::account::SqliteAccountRepository;
    use crate::infra::db;

    fn fixture() -> (SharedConnection, i64) {
        let conn = db::migrated_in_memory_connection();
        let account = SqliteAccountRepository::new(conn.clone())
            .create(&AccountDetails {
                name: "Compte courant".to_owned(),
                color: "#3b82f6".to_owned(),
                icon: "wallet".to_owned(),
                created_date: IsoDate::parse("2026-01-15").unwrap(),
                opening_balance: 100_000,
            })
            .unwrap();
        (conn, account.id)
    }

    #[test]
    fn a_freshly_created_account_has_neither_value_set() {
        let (conn, account_id) = fixture();
        let repo = SqliteReconciliationRepository::new(conn);

        assert_eq!(
            repo.find_settings(account_id).unwrap(),
            Some(ReconciliationSettings::default())
        );
    }

    #[test]
    fn find_settings_reports_an_unknown_account_as_absent() {
        let (conn, _) = fixture();
        let repo = SqliteReconciliationRepository::new(conn);

        assert_eq!(repo.find_settings(404).unwrap(), None);
    }

    #[test]
    fn a_stored_bank_balance_reads_back_as_the_same_cents() {
        let (conn, account_id) = fixture();
        let repo = SqliteReconciliationRepository::new(conn);

        repo.set_bank_balance(account_id, -123_456).unwrap();

        assert_eq!(
            repo.find_settings(account_id)
                .unwrap()
                .unwrap()
                .bank_balance,
            Some(-123_456)
        );
    }

    #[test]
    fn a_stored_statement_date_reads_back_as_the_same_date() {
        let (conn, account_id) = fixture();
        let repo = SqliteReconciliationRepository::new(conn);

        repo.set_statement_date(account_id, &IsoDate::parse("2026-02-28").unwrap())
            .unwrap();

        let settings = repo.find_settings(account_id).unwrap().unwrap();
        assert_eq!(
            settings.statement_date.map(|d| d.to_string()),
            Some("2026-02-28".to_owned())
        );
        assert_eq!(settings.bank_balance, None);
    }

    #[test]
    fn writing_one_value_leaves_the_other_alone() {
        let (conn, account_id) = fixture();
        let repo = SqliteReconciliationRepository::new(conn);

        repo.set_bank_balance(account_id, 98_450).unwrap();
        repo.set_statement_date(account_id, &IsoDate::parse("2026-02-28").unwrap())
            .unwrap();
        repo.set_bank_balance(account_id, 99_000).unwrap();

        let settings = repo.find_settings(account_id).unwrap().unwrap();
        assert_eq!(settings.bank_balance, Some(99_000));
        assert_eq!(
            settings.statement_date.map(|d| d.to_string()),
            Some("2026-02-28".to_owned())
        );
    }

    #[test]
    fn each_account_keeps_its_own_values() {
        let (conn, account_id) = fixture();
        let other = SqliteAccountRepository::new(conn.clone())
            .create(&AccountDetails {
                name: "Livret A".to_owned(),
                color: "#10b981".to_owned(),
                icon: "piggy-bank".to_owned(),
                created_date: IsoDate::parse("2026-01-15").unwrap(),
                opening_balance: 0,
            })
            .unwrap();
        let repo = SqliteReconciliationRepository::new(conn);

        repo.set_bank_balance(account_id, 98_450).unwrap();

        assert_eq!(
            repo.find_settings(other.id).unwrap().unwrap(),
            ReconciliationSettings::default()
        );
    }

    #[test]
    fn writing_against_an_unknown_account_is_refused() {
        let (conn, _) = fixture();
        let repo = SqliteReconciliationRepository::new(conn);

        assert_eq!(
            repo.set_bank_balance(404, 1).unwrap_err(),
            ReconciliationError::UnknownAccount
        );
        assert_eq!(
            repo.set_statement_date(404, &IsoDate::parse("2026-02-28").unwrap())
                .unwrap_err(),
            ReconciliationError::UnknownAccount
        );
    }

    #[test]
    fn a_malformed_stored_statement_date_is_reported_rather_than_panicking() {
        let (conn, account_id) = fixture();
        conn.lock()
            .unwrap()
            .execute(
                "UPDATE accounts SET statement_date = '28/02/2026' WHERE id = ?1",
                [account_id],
            )
            .unwrap();
        let repo = SqliteReconciliationRepository::new(conn);

        assert!(matches!(
            repo.find_settings(account_id).unwrap_err(),
            ReconciliationError::InvalidDate(_)
        ));
    }
}
