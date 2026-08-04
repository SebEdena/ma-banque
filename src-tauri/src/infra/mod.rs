//! Concrete implementations of `domain` traits (SQLite, filesystem, ...).
//!
//! `infra` depends on `domain` only, implementing its repository traits.
//! It must never depend on `usecases` or `commands`. Technical failures
//! here are represented with `anyhow`, not the `thiserror` enums used in
//! `domain`/`usecases`.

pub mod db;
