//! The data folder location: where `ma-banque.sqlite` (and its backups)
//! live. Tracked via an external pointer, since the database itself can't
//! tell the app where it is (see business requirements §2.3.1).

use std::path::PathBuf;

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", content = "message")]
pub enum DataFolderLocationError {
    #[error("no data folder is currently configured")]
    NoPointerSet,
    #[error("the folder contains an invalid or incompatible save")]
    InvalidExistingSave,
    #[error("the destination folder already contains a save")]
    DestinationOccupied,
    #[error("a filesystem error occurred: {0}")]
    Io(String),
}

/// Reads/writes the pointer to the folder holding `ma-banque.sqlite`.
///
/// `get_current_folder` returns `Ok(None)` both when no pointer has ever
/// been set (first launch) and when the pointed-at folder can no longer be
/// reached (moved/deleted/drive unplugged) — from the frontend's
/// perspective both cases surface the same "choose a location" prompt.
pub trait DataFolderLocationRepository {
    fn get_current_folder(&self) -> Result<Option<PathBuf>, DataFolderLocationError>;

    /// Creates (if needed) and points to the app-managed default folder.
    fn set_default_folder(&self) -> Result<PathBuf, DataFolderLocationError>;

    /// Points to an existing folder elsewhere, without touching the
    /// current one. An empty/non-matching folder is treated as fresh; a
    /// folder holding an invalid `ma-banque.sqlite` is rejected.
    fn open_folder(&self, path: PathBuf) -> Result<PathBuf, DataFolderLocationError>;

    /// Relocates the current folder (and its backups) to `destination`.
    /// Rejected up front if `destination` already holds a valid save.
    fn move_folder(&self, destination: PathBuf) -> Result<PathBuf, DataFolderLocationError>;
}
