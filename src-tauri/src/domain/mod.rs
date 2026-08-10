//! Business entities, invariants, and repository traits.
//!
//! `domain` has no dependency on any other module in this crate: it must
//! compile without knowing that Tauri, SQLite, or `usecases` exist.

pub mod account;
pub mod data_folder_location;
pub mod date;
pub mod entry;
pub mod money;
pub mod settings;
