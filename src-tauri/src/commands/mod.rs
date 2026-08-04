//! Tauri entry points.
//!
//! `commands` depends on `usecases` (and, to wire up state, on `infra`'s
//! concrete types). It calls into use cases and is the only layer allowed
//! to convert `anyhow`/`infra` errors into the single generic error type
//! serialized back to Angular — no internal error details should leak past
//! this boundary.
