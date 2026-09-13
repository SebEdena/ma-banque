//! Shared SQLite connection and migration runner.
//!
//! Repositories clone the `SharedConnection` handle and lock it internally
//! per call (see `domain`/`infra` module docs) rather than holding the lock
//! for their whole lifetime.

use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use rusqlite_migration::{Migrations, SchemaVersion, M};
use serde::Serialize;
use thiserror::Error;

use crate::infra::collation;

/// Connection handle shared across the app via `tauri::State`.
pub type SharedConnection = Arc<Mutex<Connection>>;

/// Records the error from the startup `open_and_migrate` attempt, if any,
/// so the frontend can find out why no connection is available (managed as
/// `tauri::State` even when there's no error to report).
#[derive(Default)]
pub struct StartupDbError(pub Mutex<Option<DbOpenError>>);

/// Number of `.sql` files embedded in [`migrations`] — kept in sync with
/// that function so the downgrade guard can tell "older than this" apart
/// from "newer than this" without a public accessor on `Migrations`.
const MIGRATION_COUNT: usize = 9;

/// How many pre-migration backups to keep (oldest dropped first).
const MAX_BACKUPS: usize = 3;

#[derive(Debug, Clone, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum DbOpenError {
    #[error("this save was created by a newer version of the app and can't be opened")]
    SchemaNewerThanSupported,
    #[error("a filesystem or database error occurred: {0}")]
    Io(String),
}

fn migrations() -> Migrations<'static> {
    let ms = vec![
        M::up(include_str!("../../migrations/0001_create_settings.sql")),
        M::up(include_str!("../../migrations/0002_settings_defaults.sql")),
        M::up(include_str!("../../migrations/0003_create_accounts.sql")),
        M::up(include_str!("../../migrations/0004_create_entries.sql")),
        M::up(include_str!("../../migrations/0005_create_categories.sql")),
        M::up(include_str!(
            "../../migrations/0006_entries_label_description.sql"
        )),
        M::up(include_str!(
            "../../migrations/0007_accounts_reconciliation.sql"
        )),
        M::up(include_str!(
            "../../migrations/0008_create_recurring_rules.sql"
        )),
        M::up(include_str!(
            "../../migrations/0009_recurring_rules_daily_frequency.sql"
        )),
    ];
    debug_assert_eq!(ms.len(), MIGRATION_COUNT);
    Migrations::new(ms)
}

/// Whether `conn`'s current schema is one this app's migrations know about
/// — `false` for a schema newer than the app supports (or unreadable).
/// Shared by the downgrade guard here and by `data_folder_location`'s save
/// validation, so both agree on what counts as an openable save.
pub fn is_schema_supported(conn: &Connection) -> bool {
    !matches!(
        migrations().current_version(conn),
        Ok(SchemaVersion::Outside(_)) | Err(_)
    )
}

/// Opens (or creates) the database at `db_path`, guarding against schemas
/// newer than the app supports and backing up the file before applying any
/// pending migration.
pub fn open_and_migrate(db_path: &Path) -> Result<SharedConnection, DbOpenError> {
    Ok(Arc::new(Mutex::new(open_and_migrate_connection(db_path)?)))
}

/// Points `shared` at a freshly opened connection to `db_path`, replacing
/// whatever connection it held — every repository holding a clone of
/// `shared` sees the new connection on their very next `.lock()`, with no
/// need to re-register any `tauri::State`. Used by the data-folder-location
/// commands so switching folders while the app is running takes effect
/// immediately, instead of requiring a restart.
pub fn reopen(shared: &SharedConnection, db_path: &Path) -> Result<(), DbOpenError> {
    let fresh = open_and_migrate_connection(db_path)?;
    *shared.lock().unwrap() = fresh;
    Ok(())
}

/// An unmigrated in-memory connection used as `shared_conn`'s initial value
/// before any real data folder is available (first launch, or a startup
/// open failure) — `reopen` replaces it once one is. Never queried before
/// that: the frontend blocks routing to any screen that reads/writes
/// settings until `get_current_data_folder` resolves to a real folder.
pub fn placeholder_connection() -> SharedConnection {
    let conn =
        Connection::open_in_memory().expect("in-memory sqlite connection should always open");
    collation::register(&conn).expect("collation should register on a fresh connection");
    Arc::new(Mutex::new(conn))
}

/// A fresh, fully migrated in-memory database — one per call, so repository
/// integration tests never share state.
#[cfg(test)]
pub fn migrated_in_memory_connection() -> SharedConnection {
    let mut conn = Connection::open_in_memory().expect("in-memory sqlite connection should open");
    collation::register(&conn).expect("collation should register on a fresh connection");
    migrations()
        .to_latest(&mut conn)
        .expect("migrations should apply cleanly");
    Arc::new(Mutex::new(conn))
}

fn open_and_migrate_connection(db_path: &Path) -> Result<Connection, DbOpenError> {
    let existed_before = db_path.is_file();

    let mut conn = Connection::open(db_path).map_err(io_err)?;
    collation::register(&conn).map_err(io_err)?;

    if !is_schema_supported(&conn) {
        return Err(DbOpenError::SchemaNewerThanSupported);
    }

    let current_version = migrations().current_version(&conn).map_err(io_err)?;
    let has_pending_migrations = match current_version {
        SchemaVersion::NoneSet => existed_before,
        SchemaVersion::Inside(v) => usize::from(v) < MIGRATION_COUNT,
        SchemaVersion::Outside(_) => unreachable!("handled above"),
    };

    if existed_before && has_pending_migrations {
        backup_before_migrate(db_path).map_err(io_err)?;
    }

    migrations().to_latest(&mut conn).map_err(io_err)?;

    Ok(conn)
}

fn io_err<E: std::fmt::Display>(e: E) -> DbOpenError {
    DbOpenError::Io(e.to_string())
}

fn backup_before_migrate(db_path: &Path) -> anyhow::Result<()> {
    let dir = db_path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("database path has no parent folder"))?;
    let file_name = db_path
        .file_name()
        .ok_or_else(|| anyhow::anyhow!("database path has no file name"))?
        .to_string_lossy()
        .into_owned();

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let backup_path = dir.join(format!("{file_name}.bak-{timestamp}"));
    fs::copy(db_path, &backup_path)?;

    rotate_backups(dir, &file_name)?;
    Ok(())
}

fn rotate_backups(dir: &Path, db_file_name: &str) -> anyhow::Result<()> {
    let prefix = format!("{db_file_name}.bak-");

    let mut backups: Vec<_> = fs::read_dir(dir)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(&prefix))
        })
        .collect();
    backups.sort();

    while backups.len() > MAX_BACKUPS {
        let oldest = backups.remove(0);
        fs::remove_file(oldest)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn migrations_create_the_settings_table() {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        migrations()
            .to_latest(&mut conn)
            .expect("migrations should apply cleanly");

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

    #[test]
    fn the_reconciliation_columns_land_null_on_pre_existing_accounts() {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        collation::register(&conn).unwrap();

        // A save from before 0007: accounts exist, the two columns don't.
        migrations()
            .to_version(&mut conn, 6)
            .expect("migrations up to 0006 should apply cleanly");
        for name in ["Compte courant", "Livret A"] {
            conn.execute(
                "INSERT INTO accounts (name, color, icon, created_date, opening_balance) \
                 VALUES (?1, '#3b82f6', 'wallet', '2026-01-15', 100000)",
                [name],
            )
            .unwrap();
        }

        migrations()
            .to_version(&mut conn, 7)
            .expect("0007 should apply to a database holding accounts");

        let unset: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM accounts \
                 WHERE bank_balance IS NULL AND statement_date IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(unset, 2, "both columns should be NULL on every account");
    }

    #[test]
    fn the_recurring_rule_migration_applies_over_pre_existing_accounts_and_entries() {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        collation::register(&conn).unwrap();
        migrations()
            .to_version(&mut conn, 6)
            .expect("migrations up to 0006 should apply cleanly");

        conn.execute(
            "INSERT INTO accounts (name, color, icon, created_date, opening_balance) \
             VALUES ('Compte', '#000000', 'wallet', '2026-01-15', 100000)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO entries (account_id, date, type, amount, is_system) \
             VALUES (1, '2026-01-15', 'CREDIT', 100000, 1)",
            [],
        )
        .unwrap();

        migrations()
            .to_latest(&mut conn)
            .expect("0007 and 0008 should apply over existing data");

        let tables: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' \
                 AND name IN ('recurring_rules', 'recurring_rule_overrides')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tables, 2);

        let entries: i64 = conn
            .query_row("SELECT COUNT(*) FROM entries", [], |row| row.get(0))
            .unwrap();
        assert_eq!(entries, 1, "pre-existing entries should survive");
    }

    #[test]
    fn open_and_migrate_creates_a_fresh_database_with_no_backup() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("ma-banque.sqlite");

        let shared = open_and_migrate(&db_path).expect("should open cleanly");
        {
            let conn = shared.lock().unwrap();
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='settings')",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(exists);
        }

        let backups: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".bak-"))
            .collect();
        assert!(
            backups.is_empty(),
            "a brand-new database should not be backed up"
        );
    }

    #[test]
    fn open_and_migrate_backs_up_an_existing_db_that_has_a_pending_migration() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("ma-banque.sqlite");

        // Pre-existing database file with no schema applied yet (`NoneSet`)
        // — simulates a real save that still has migrations pending.
        Connection::open(&db_path).unwrap();

        open_and_migrate(&db_path).unwrap();

        let backups: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".bak-"))
            .collect();
        assert_eq!(backups.len(), 1);
    }

    #[test]
    fn backup_rotation_keeps_only_the_last_three() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("ma-banque.sqlite");
        fs::write(&db_path, b"pretend database contents").unwrap();

        for _ in 0..4 {
            backup_before_migrate(&db_path).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(1));
        }

        let backups: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".bak-"))
            .collect();
        assert_eq!(backups.len(), MAX_BACKUPS);
    }

    #[test]
    fn reopen_points_every_clone_of_shared_at_the_new_database() {
        let dir = tempdir().unwrap();
        let old_path = dir.path().join("old.sqlite");
        let new_path = dir.path().join("new.sqlite");

        let shared = open_and_migrate(&old_path).expect("should open cleanly");
        let cloned = shared.clone();

        reopen(&shared, &new_path).expect("should reopen cleanly");

        // A clone taken before the reopen sees the new connection too —
        // it's the same `Arc<Mutex<Connection>>`, not a new one.
        let conn = cloned.lock().unwrap();
        let db_file: String = conn
            .query_row("PRAGMA database_list", [], |row| row.get(2))
            .unwrap();
        assert!(db_file.ends_with("new.sqlite"), "got {db_file}");
    }

    #[test]
    fn reopen_surfaces_the_same_errors_as_open_and_migrate() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("ma-banque.sqlite");
        open_and_migrate(&db_path).unwrap();
        {
            let conn = Connection::open(&db_path).unwrap();
            conn.pragma_update(None, "user_version", MIGRATION_COUNT + 1)
                .unwrap();
        }

        let shared = placeholder_connection();
        let err = reopen(&shared, &db_path).unwrap_err();
        assert!(matches!(err, DbOpenError::SchemaNewerThanSupported));
    }

    #[test]
    fn open_and_migrate_refuses_a_schema_newer_than_supported() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("ma-banque.sqlite");
        open_and_migrate(&db_path).unwrap();

        {
            let conn = Connection::open(&db_path).unwrap();
            conn.pragma_update(None, "user_version", MIGRATION_COUNT + 1)
                .unwrap();
        }

        let err = open_and_migrate(&db_path).unwrap_err();
        assert!(matches!(err, DbOpenError::SchemaNewerThanSupported));

        // No backup should be attempted for a rejected open.
        let backups: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".bak-"))
            .collect();
        assert!(backups.is_empty());
    }
}
