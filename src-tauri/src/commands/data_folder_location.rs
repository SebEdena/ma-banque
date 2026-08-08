//! Tauri commands exposing the data folder location to Angular.

use std::path::{Component, Path, PathBuf};

use tauri::State;

use crate::domain::data_folder_location::{
    DataFolderLocationError, DynDataFolderLocationRepository,
};
use crate::infra::db::{self, SharedConnection, StartupDbError};
use crate::infra::DB_FILE_NAME;
use crate::usecases::data_folder_location as usecases;

fn to_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

/// Points the app's live `shared_conn` at `folder`'s database — called
/// after every successful open/move/default so the new folder takes effect
/// immediately, instead of only on the next app restart (see `infra::db`'s
/// `reopen` doc comment). Also clears `startup_error`: a folder picked here
/// successfully supersedes whatever failed at startup.
fn reopen_db(
    shared_conn: &SharedConnection,
    startup_error: &StartupDbError,
    folder: &Path,
) -> Result<(), DataFolderLocationError> {
    db::reopen(shared_conn, &folder.join(DB_FILE_NAME))
        .map_err(|e| DataFolderLocationError::Io(e.to_string()))?;
    *startup_error.0.lock().unwrap() = None;
    Ok(())
}

/// Lexically resolves `..` (and `.`) components out of a path picked by the
/// user, without touching the filesystem — `canonicalize` isn't usable here
/// since a move/open destination may not exist yet. Left as-is otherwise:
/// this is about producing a clean, unambiguous path to store and display,
/// not a jail check (the OS itself already confines every access to
/// wherever the resolved path lands).
fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => match normalized.components().next_back() {
                Some(Component::Normal(_)) => {
                    normalized.pop();
                }
                Some(Component::RootDir) => {
                    // ".." above the root is a no-op.
                }
                _ => normalized.push(component),
            },
            other => normalized.push(other),
        }
    }
    normalized
}

#[tauri::command]
pub fn get_current_data_folder(
    repo: State<DynDataFolderLocationRepository>,
) -> Result<Option<String>, DataFolderLocationError> {
    Ok(usecases::get_current_folder(&**repo)?.map(to_string))
}

#[tauri::command]
pub fn set_default_data_folder(
    repo: State<DynDataFolderLocationRepository>,
    shared_conn: State<SharedConnection>,
    startup_error: State<StartupDbError>,
) -> Result<String, DataFolderLocationError> {
    let folder = usecases::set_default_folder(&**repo)?;
    reopen_db(&shared_conn, &startup_error, &folder)?;
    Ok(to_string(folder))
}

#[tauri::command]
pub fn open_data_folder(
    repo: State<DynDataFolderLocationRepository>,
    shared_conn: State<SharedConnection>,
    startup_error: State<StartupDbError>,
    path: String,
) -> Result<String, DataFolderLocationError> {
    let folder = usecases::open_folder(&**repo, normalize_path(&PathBuf::from(path)))?;
    reopen_db(&shared_conn, &startup_error, &folder)?;
    Ok(to_string(folder))
}

#[tauri::command]
pub fn move_data_folder(
    repo: State<DynDataFolderLocationRepository>,
    shared_conn: State<SharedConnection>,
    startup_error: State<StartupDbError>,
    destination: String,
) -> Result<String, DataFolderLocationError> {
    let folder = usecases::move_folder(&**repo, normalize_path(&PathBuf::from(destination)))?;
    reopen_db(&shared_conn, &startup_error, &folder)?;
    Ok(to_string(folder))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_path_resolves_parent_dir_components() {
        assert_eq!(
            normalize_path(Path::new("/home/user/../other")),
            PathBuf::from("/home/other")
        );
    }

    #[test]
    fn normalize_path_does_not_escape_the_root() {
        assert_eq!(
            normalize_path(Path::new("/../../etc/passwd")),
            PathBuf::from("/etc/passwd")
        );
    }

    #[test]
    fn normalize_path_drops_current_dir_components() {
        assert_eq!(
            normalize_path(Path::new("/home/./user/./data")),
            PathBuf::from("/home/user/data")
        );
    }

    #[test]
    fn normalize_path_leaves_a_clean_absolute_path_untouched() {
        assert_eq!(
            normalize_path(Path::new("/home/user/saves")),
            PathBuf::from("/home/user/saves")
        );
    }
}
