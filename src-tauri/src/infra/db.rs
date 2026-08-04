//! Shared SQLite connection and migration runner.
//!
//! Repositories clone the `SharedConnection` handle and lock it internally
//! per call (see `domain`/`infra` module docs) rather than holding the lock
//! for their whole lifetime.

use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

/// Connection handle shared across the app via `tauri::State`.
pub type SharedConnection = Arc<Mutex<Connection>>;

fn migrations() -> Migrations<'static> {
    Migrations::new(vec![M::up(include_str!(
        "../../migrations/0001_create_settings.sql"
    ))])
}

/// Runs all pending migrations against `conn`, wrapping it for shared use.
///
/// `.sql` migration files are embedded into the binary at compile time via
/// `include_str!`, so the app never depends on files present on disk.
pub fn init(mut conn: Connection) -> anyhow::Result<SharedConnection> {
    migrations().to_latest(&mut conn)?;
    Ok(Arc::new(Mutex::new(conn)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_create_the_settings_table() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        let shared = init(conn).expect("migrations should apply cleanly");

        let conn = shared.lock().expect("lock connection");
        let table_exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings')",
                [],
                |row| row.get(0),
            )
            .expect("query sqlite_master");

        assert!(
            table_exists,
            "expected `settings` table to exist after migrations"
        );
    }
}
