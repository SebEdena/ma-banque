//! Tauri commands exposing display settings to Angular.

use tauri::State;

use crate::domain::settings::{DisplaySettings, DynSettingsRepository, SettingsError};
use crate::usecases::settings as usecases;

#[tauri::command]
pub fn get_display_settings(
    repo: State<DynSettingsRepository>,
) -> Result<DisplaySettings, SettingsError> {
    usecases::get_display_settings(&**repo)
}

#[tauri::command]
pub fn update_display_settings(
    repo: State<DynSettingsRepository>,
    settings: DisplaySettings,
) -> Result<(), SettingsError> {
    usecases::update_display_settings(&**repo, settings)
}
