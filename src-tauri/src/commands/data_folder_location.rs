//! Tauri commands exposing the data folder location to Angular.

use tauri::State;

use crate::domain::data_folder_location::{
    DataFolderLocationError, DynDataFolderLocationRepository,
};
use crate::usecases::data_folder_location as usecases;

fn to_string(path: std::path::PathBuf) -> String {
    path.to_string_lossy().into_owned()
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
) -> Result<String, DataFolderLocationError> {
    Ok(to_string(usecases::set_default_folder(&**repo)?))
}

#[tauri::command]
pub fn open_data_folder(
    repo: State<DynDataFolderLocationRepository>,
    path: String,
) -> Result<String, DataFolderLocationError> {
    Ok(to_string(usecases::open_folder(
        &**repo,
        std::path::PathBuf::from(path),
    )?))
}

#[tauri::command]
pub fn move_data_folder(
    repo: State<DynDataFolderLocationRepository>,
    destination: String,
) -> Result<String, DataFolderLocationError> {
    Ok(to_string(usecases::move_folder(
        &**repo,
        std::path::PathBuf::from(destination),
    )?))
}
