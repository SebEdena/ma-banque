//! Concrete implementations of `domain` traits (SQLite, filesystem, ...).
//!
//! `infra` depends on `domain` only, implementing its repository traits.
//! It must never depend on `usecases` or `commands`. Technical failures
//! here are represented with `anyhow`, not the `thiserror` enums used in
//! `domain`/`usecases`.

pub mod account;
pub mod data_folder_location;
pub mod db;
pub mod entry;
pub mod settings;

/// Filename of the SQLite database inside a data folder.
pub const DB_FILE_NAME: &str = "ma-banque.sqlite";
