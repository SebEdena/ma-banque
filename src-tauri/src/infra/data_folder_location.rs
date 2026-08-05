//! Filesystem-backed implementation of `DataFolderLocationRepository`.
//!
//! The pointer to the current data folder is kept in a small JSON config
//! file, separate from the SQLite database itself (the database can't say
//! where it lives).

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};

use crate::domain::data_folder_location::{DataFolderLocationError, DataFolderLocationRepository};
use crate::infra::DB_FILE_NAME;

const POINTER_FILE_NAME: &str = "config.json";
const DEFAULT_FOLDER_NAME: &str = "saves";

#[derive(Serialize, Deserialize)]
struct PointerConfig {
    data_folder_path: PathBuf,
}

pub struct FsDataFolderLocationRepository {
    config_dir: PathBuf,
    data_dir: PathBuf,
}

impl FsDataFolderLocationRepository {
    pub fn new(config_dir: PathBuf, data_dir: PathBuf) -> Self {
        Self {
            config_dir,
            data_dir,
        }
    }

    fn pointer_file(&self) -> PathBuf {
        self.config_dir.join(POINTER_FILE_NAME)
    }

    fn default_folder(&self) -> PathBuf {
        self.data_dir.join(DEFAULT_FOLDER_NAME)
    }

    fn write_pointer(&self, folder: &Path) -> Result<(), DataFolderLocationError> {
        fs::create_dir_all(&self.config_dir).map_err(io_err)?;
        let contents = serde_json::to_string(&PointerConfig {
            data_folder_path: folder.to_path_buf(),
        })
        .map_err(|e| DataFolderLocationError::Io(e.to_string()))?;
        fs::write(self.pointer_file(), contents).map_err(io_err)
    }
}

impl DataFolderLocationRepository for FsDataFolderLocationRepository {
    fn get_current_folder(&self) -> Result<Option<PathBuf>, DataFolderLocationError> {
        let pointer_path = self.pointer_file();
        if !pointer_path.is_file() {
            return Ok(None);
        }

        let contents = match fs::read_to_string(&pointer_path) {
            Ok(contents) => contents,
            Err(_) => return Ok(None),
        };
        let pointer: PointerConfig = match serde_json::from_str(&contents) {
            Ok(pointer) => pointer,
            Err(_) => return Ok(None),
        };

        if !pointer.data_folder_path.is_dir() {
            return Ok(None);
        }

        Ok(Some(pointer.data_folder_path))
    }

    fn set_default_folder(&self) -> Result<PathBuf, DataFolderLocationError> {
        let folder = self.default_folder();
        fs::create_dir_all(&folder).map_err(io_err)?;
        self.write_pointer(&folder)?;
        Ok(folder)
    }

    fn open_folder(&self, path: PathBuf) -> Result<PathBuf, DataFolderLocationError> {
        fs::create_dir_all(&path).map_err(io_err)?;

        let db_path = path.join(DB_FILE_NAME);
        if db_path.is_file() && !is_valid_save(&db_path) {
            return Err(DataFolderLocationError::InvalidExistingSave);
        }

        self.write_pointer(&path)?;
        Ok(path)
    }

    fn move_folder(&self, destination: PathBuf) -> Result<PathBuf, DataFolderLocationError> {
        let current = self
            .get_current_folder()?
            .ok_or(DataFolderLocationError::NoPointerSet)?;

        let destination_db = destination.join(DB_FILE_NAME);
        if destination_db.is_file() && is_valid_save(&destination_db) {
            return Err(DataFolderLocationError::DestinationOccupied);
        }

        fs::create_dir_all(&destination).map_err(io_err)?;
        copy_dir_contents(&current, &destination).map_err(io_err)?;

        let moved_db = destination.join(DB_FILE_NAME);
        if moved_db.is_file() && !is_valid_save(&moved_db) {
            // The copy didn't verify — clean up the partial copy and leave
            // the current (untouched) folder as the source of truth.
            let _ = fs::remove_dir_all(&destination);
            return Err(DataFolderLocationError::Io(
                "the copied data could not be verified after the move".to_string(),
            ));
        }

        fs::remove_dir_all(&current).map_err(io_err)?;
        self.write_pointer(&destination)?;
        Ok(destination)
    }
}

fn io_err(e: std::io::Error) -> DataFolderLocationError {
    DataFolderLocationError::Io(e.to_string())
}

/// A folder's `ma-banque.sqlite` is valid if it's a SQLite database with
/// the `settings` table (proof it's an actual ma-banque save, not just any
/// file that happens to share the name) whose schema this app's migrations
/// support — otherwise a folder pointing at a newer save would be accepted
/// here only to fail later when `infra::db::open_and_migrate` connects it.
fn is_valid_save(db_path: &Path) -> bool {
    let Ok(conn) = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY) else {
        return false;
    };
    let has_settings_table: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);
    has_settings_table && crate::infra::db::is_schema_supported(&conn)
}

fn copy_dir_contents(from: &Path, to: &Path) -> std::io::Result<()> {
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let dest_path = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            fs::create_dir_all(&dest_path)?;
            copy_dir_contents(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), dest_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn valid_save_at(path: &Path) {
        let conn = Connection::open(path).expect("open db");
        conn.execute(
            "CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)",
            [],
        )
        .expect("create settings table");
    }

    fn repo(config_dir: &Path, data_dir: &Path) -> FsDataFolderLocationRepository {
        FsDataFolderLocationRepository::new(config_dir.to_path_buf(), data_dir.to_path_buf())
    }

    #[test]
    fn get_current_folder_is_none_when_no_pointer_exists() {
        let config = tempdir().unwrap();
        let data = tempdir().unwrap();
        let repo = repo(config.path(), data.path());

        assert_eq!(repo.get_current_folder().unwrap(), None);
    }

    #[test]
    fn get_current_folder_is_none_when_pointed_folder_is_unreachable() {
        let config = tempdir().unwrap();
        let data = tempdir().unwrap();
        let repo = repo(config.path(), data.path());

        let ghost_folder = data.path().join("ghost");
        repo.write_pointer(&ghost_folder).unwrap();

        assert_eq!(repo.get_current_folder().unwrap(), None);
    }

    #[test]
    fn set_default_folder_creates_saves_folder_and_points_to_it() {
        let config = tempdir().unwrap();
        let data = tempdir().unwrap();
        let repo = repo(config.path(), data.path());

        let folder = repo.set_default_folder().unwrap();

        assert_eq!(folder, data.path().join("saves"));
        assert!(folder.is_dir());
        assert_eq!(repo.get_current_folder().unwrap(), Some(folder));
    }

    #[test]
    fn open_folder_accepts_an_empty_folder_as_fresh() {
        let config = tempdir().unwrap();
        let data = tempdir().unwrap();
        let repo = repo(config.path(), data.path());

        let target = data.path().join("elsewhere");
        let opened = repo.open_folder(target.clone()).unwrap();

        assert_eq!(opened, target);
        assert_eq!(repo.get_current_folder().unwrap(), Some(target));
    }

    #[test]
    fn open_folder_accepts_a_folder_with_a_valid_existing_save() {
        let config = tempdir().unwrap();
        let data = tempdir().unwrap();
        let repo = repo(config.path(), data.path());

        let target = data.path().join("restored");
        fs::create_dir_all(&target).unwrap();
        valid_save_at(&target.join(DB_FILE_NAME));

        let opened = repo.open_folder(target.clone()).unwrap();
        assert_eq!(opened, target);
    }

    #[test]
    fn open_folder_rejects_a_folder_whose_save_is_newer_than_supported() {
        let config = tempdir().unwrap();
        let data = tempdir().unwrap();
        let repo = repo(config.path(), data.path());

        let target = data.path().join("from-the-future");
        fs::create_dir_all(&target).unwrap();
        let db_path = target.join(DB_FILE_NAME);
        valid_save_at(&db_path);
        Connection::open(&db_path)
            .unwrap()
            .pragma_update(None, "user_version", 999)
            .unwrap();

        let err = repo.open_folder(target).unwrap_err();
        assert_eq!(err, DataFolderLocationError::InvalidExistingSave);
    }

    #[test]
    fn open_folder_rejects_a_folder_with_an_invalid_save() {
        let config = tempdir().unwrap();
        let data = tempdir().unwrap();
        let repo = repo(config.path(), data.path());

        let target = data.path().join("corrupted");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join(DB_FILE_NAME), b"not a sqlite file").unwrap();

        let err = repo.open_folder(target).unwrap_err();
        assert_eq!(err, DataFolderLocationError::InvalidExistingSave);
    }

    #[test]
    fn move_folder_fails_when_no_pointer_is_set() {
        let config = tempdir().unwrap();
        let data = tempdir().unwrap();
        let repo = repo(config.path(), data.path());

        let err = repo.move_folder(data.path().join("new")).unwrap_err();
        assert_eq!(err, DataFolderLocationError::NoPointerSet);
    }

    #[test]
    fn move_folder_relocates_contents_and_updates_the_pointer() {
        let config = tempdir().unwrap();
        let data = tempdir().unwrap();
        let repo = repo(config.path(), data.path());

        let current = repo.set_default_folder().unwrap();
        valid_save_at(&current.join(DB_FILE_NAME));
        fs::write(current.join(DB_FILE_NAME.to_owned() + ".bak-1"), b"backup").unwrap();

        let destination = data.path().join("new-home");
        let moved = repo.move_folder(destination.clone()).unwrap();

        assert_eq!(moved, destination);
        assert!(destination.join(DB_FILE_NAME).is_file());
        assert!(destination.join(format!("{DB_FILE_NAME}.bak-1")).is_file());
        assert!(!current.exists());
        assert_eq!(repo.get_current_folder().unwrap(), Some(destination));
    }

    #[test]
    fn move_folder_is_rejected_when_destination_already_has_a_valid_save() {
        let config = tempdir().unwrap();
        let data = tempdir().unwrap();
        let repo = repo(config.path(), data.path());

        let current = repo.set_default_folder().unwrap();
        valid_save_at(&current.join(DB_FILE_NAME));

        let destination = data.path().join("occupied");
        fs::create_dir_all(&destination).unwrap();
        valid_save_at(&destination.join(DB_FILE_NAME));

        let err = repo.move_folder(destination).unwrap_err();
        assert_eq!(err, DataFolderLocationError::DestinationOccupied);
        assert!(current.is_dir(), "current folder must be untouched");
    }
}
