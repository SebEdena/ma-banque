//! Categories (_postes_): the global, flat labels entries are tagged with.
//!
//! Global rather than per-account, and flat in v1 — business requirements
//! §3.2 defers sub-categories, so there's no `parent_id` here. The starting
//! twelve are seeded by `migrations/0005_create_categories.sql` and are
//! ordinary categories afterwards: nothing distinguishes them from one the
//! user created, so any of them can be renamed or deleted.

use serde::Serialize;
use thiserror::Error;

use crate::domain::entry::EntryError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub icon: String,
    /// Empty when the user left it blank, never absent.
    pub description: String,
}

/// The fields a user supplies when creating or editing a category —
/// identical in both directions, since the modal is one shared create/edit
/// form.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CategoryDetails {
    pub name: String,
    pub color: String,
    pub icon: String,
    pub description: String,
}

/// Serialized to Angular as `{ kind, message }`, same as `AccountError`. The
/// messages stay English like the rest of the source: Angular maps each
/// `kind` to the French the user actually sees.
#[derive(Debug, Error, Serialize, PartialEq, Eq, Clone)]
#[serde(tag = "kind", content = "message")]
pub enum CategoryError {
    #[error("no such category")]
    NotFound,
    #[error("a category name cannot be empty")]
    EmptyName,
    #[error("a category must have an icon")]
    EmptyIcon,
    #[error("this category is still used by entries")]
    InUse,
    #[error("a filesystem or database error occurred: {0}")]
    Io(String),
}

impl From<EntryError> for CategoryError {
    fn from(error: EntryError) -> Self {
        match error {
            EntryError::InvalidStoredValue(message) | EntryError::Io(message) => {
                CategoryError::Io(message)
            }
            // The category rules never create/edit/delete an entry directly
            // — only `usecases::entry` does — so these never actually occur
            // through this path; kept exhaustive rather than an unreachable!.
            other => CategoryError::Io(other.to_string()),
        }
    }
}

/// Persistence for categories.
pub trait CategoryRepository {
    fn create(&self, details: &CategoryDetails) -> Result<Category, CategoryError>;

    fn update(&self, id: i64, details: &CategoryDetails) -> Result<Category, CategoryError>;

    /// Removes the category outright. Callers are responsible for the
    /// "no entry still uses it" guard first.
    fn delete(&self, id: i64) -> Result<(), CategoryError>;

    fn find(&self, id: i64) -> Result<Option<Category>, CategoryError>;

    /// Every category, ordered by name case-insensitively — the one order
    /// the app shows them in (no user-configurable sort in v1), so it's part
    /// of this contract rather than something each caller re-applies.
    fn list(&self) -> Result<Vec<Category>, CategoryError>;
}

pub type DynCategoryRepository = Box<dyn CategoryRepository + Send + Sync>;
