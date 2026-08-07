//! SQLite-backed implementation of `SettingsRepository`, against the
//! key/value `settings` table (see `migrations/0001_create_settings.sql`
//! and `migrations/0002_settings_defaults.sql`).

use rusqlite::OptionalExtension;

use crate::domain::settings::{
    CurrencyFormat, DateFormat, DisplaySettings, SettingsError, SettingsRepository,
};
use crate::infra::db::SharedConnection;

const DATE_FORMAT_KEY: &str = "date_format";
const CURRENCY_FORMAT_KEY: &str = "currency_format";

pub struct SqliteSettingsRepository {
    conn: SharedConnection,
}

impl SqliteSettingsRepository {
    pub fn new(conn: SharedConnection) -> Self {
        Self { conn }
    }
}

fn read_value(conn: &rusqlite::Connection, key: &str) -> Result<String, SettingsError> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
        row.get::<_, String>(0)
    })
    .optional()
    .map_err(|e| SettingsError::Io(e.to_string()))?
    .ok_or_else(|| SettingsError::InvalidStoredValue(format!("missing settings row: {key}")))
}

impl SettingsRepository for SqliteSettingsRepository {
    fn get_display_settings(&self) -> Result<DisplaySettings, SettingsError> {
        let conn = self.conn.lock().unwrap();

        let date_format = DateFormat::parse(&read_value(&conn, DATE_FORMAT_KEY)?)?;
        let currency_format = CurrencyFormat::parse(&read_value(&conn, CURRENCY_FORMAT_KEY)?)?;

        Ok(DisplaySettings {
            date_format,
            currency_format,
        })
    }

    fn update_display_settings(&self, settings: DisplaySettings) -> Result<(), SettingsError> {
        let mut conn = self.conn.lock().unwrap();

        // Both keys represent one logical `DisplaySettings` value — wrap the
        // two writes in a transaction so a failure partway through never
        // leaves date_format/currency_format out of sync with each other.
        let tx = conn
            .transaction()
            .map_err(|e| SettingsError::Io(e.to_string()))?;

        tx.execute(
            "UPDATE settings SET value = ?1 WHERE key = ?2",
            rusqlite::params![settings.date_format.as_str(), DATE_FORMAT_KEY],
        )
        .map_err(|e| SettingsError::Io(e.to_string()))?;

        tx.execute(
            "UPDATE settings SET value = ?1 WHERE key = ?2",
            rusqlite::params![settings.currency_format.as_str(), CURRENCY_FORMAT_KEY],
        )
        .map_err(|e| SettingsError::Io(e.to_string()))?;

        tx.commit().map_err(|e| SettingsError::Io(e.to_string()))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::db;
    use std::sync::{Arc, Mutex};
    use tempfile::tempdir;

    fn migrated_connection() -> SharedConnection {
        // `keep()` hands back the path without deleting the directory on
        // drop — the returned connection outlives this function, so the
        // backing file must survive past it too.
        let dir = tempdir().unwrap().keep();
        let db_path = dir.join("ma-banque.sqlite");
        db::open_and_migrate(&db_path).expect("should open cleanly")
    }

    fn in_memory_connection_without_migrations() -> SharedConnection {
        Arc::new(Mutex::new(rusqlite::Connection::open_in_memory().unwrap()))
    }

    #[test]
    fn default_row_is_present_on_a_fresh_database() {
        let conn = migrated_connection();
        let repo = SqliteSettingsRepository::new(conn);

        let settings = repo.get_display_settings().unwrap();

        assert_eq!(settings.date_format, DateFormat::Dmy);
        assert_eq!(settings.currency_format, CurrencyFormat::SymbolAfter);
    }

    #[test]
    fn update_persists_and_is_re_readable() {
        let conn = migrated_connection();
        let repo = SqliteSettingsRepository::new(conn);

        repo.update_display_settings(DisplaySettings {
            date_format: DateFormat::Ymd,
            currency_format: CurrencyFormat::IsoCode,
        })
        .unwrap();

        let settings = repo.get_display_settings().unwrap();
        assert_eq!(settings.date_format, DateFormat::Ymd);
        assert_eq!(settings.currency_format, CurrencyFormat::IsoCode);
    }

    #[test]
    fn get_display_settings_fails_clearly_when_rows_are_missing() {
        let conn = in_memory_connection_without_migrations();
        conn.lock()
            .unwrap()
            .execute(
                "CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)",
                [],
            )
            .unwrap();
        let repo = SqliteSettingsRepository::new(conn);

        let err = repo.get_display_settings().unwrap_err();
        assert!(matches!(err, SettingsError::InvalidStoredValue(_)));
    }
}
