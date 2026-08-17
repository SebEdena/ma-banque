//! Orchestration of business rules.
//!
//! `usecases` depends on `domain` (entities, repository traits) only. It
//! must never depend on `infra` or `commands`, and must never reference a
//! SQLite connection directly — repositories are consumed as `&dyn Trait`.

pub mod account;
pub mod category;
pub mod data_folder_location;
pub mod entry;
pub mod reconciliation;
pub mod settings;
