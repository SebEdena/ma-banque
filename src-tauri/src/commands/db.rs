//! Tauri commands surfacing database startup state to Angular.

use tauri::State;

use crate::infra::db::{DbOpenError, StartupDbError};

/// The error from the startup attempt to open the configured data folder,
/// if any (e.g. the save is newer than this app version supports).
#[tauri::command]
pub fn get_startup_db_error(state: State<StartupDbError>) -> Option<DbOpenError> {
    state.0.lock().unwrap().clone()
}
