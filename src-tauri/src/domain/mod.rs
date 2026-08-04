//! Business entities, invariants, and repository traits.
//!
//! `domain` has no dependency on any other module in this crate: it must
//! compile without knowing that Tauri, SQLite, or `usecases` exist.
