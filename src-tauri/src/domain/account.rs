//! Bank accounts (_comptes_): the entity every register hangs off.
//!
//! An account is never persisted without its opening-balance system entry —
//! the two writes that keep that true are single repository operations here
//! precisely so no caller can perform one without the other.

use serde::Serialize;
use thiserror::Error;

use crate::domain::date::{InvalidDate, IsoDate};
use crate::domain::entry::{EntryError, SystemEntry};
use crate::domain::money::InvalidAmount;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Account {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub created_date: IsoDate,
    /// Cents.
    pub opening_balance: i64,
    pub archived: bool,
    pub last_viewed_date: Option<IsoDate>,
}

/// The fields a user supplies when creating or editing an account —
/// identical in both directions, since the settings modal is one shared
/// create/edit form.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountDetails {
    pub name: String,
    pub color: String,
    pub icon: String,
    pub created_date: IsoDate,
    /// Cents.
    pub opening_balance: i64,
}

impl AccountDetails {
    /// The system entry these details imply: dated at the opening date,
    /// carrying the opening balance.
    pub fn system_entry(&self) -> SystemEntry {
        SystemEntry {
            date: self.created_date.clone(),
            amount: crate::domain::entry::SignedCents::new(self.opening_balance),
        }
    }
}

/// Serialized to Angular as `{ kind, message }`, same as `SettingsError` and
/// `DataFolderLocationError`. The messages stay English like the rest of the
/// source: Angular maps each `kind` to the French the user actually sees (see
/// `parseSettingsError` in `core/settings-api`), so the UI's wording lives on
/// the UI side rather than being split across two languages here.
#[derive(Debug, Error, Serialize, PartialEq, Eq, Clone)]
#[serde(tag = "kind", content = "message")]
pub enum AccountError {
    #[error("no such account")]
    NotFound,
    #[error("an account name cannot be empty")]
    EmptyName,
    #[error("an account's opening date must fall before its first entry")]
    OpeningDateNotBeforeFirstEntry,
    #[error("this account has entries beyond its opening balance")]
    HasNonSystemEntries,
    #[error("invalid amount: {0}")]
    InvalidAmount(String),
    #[error("invalid date: {0}")]
    InvalidDate(String),
    #[error("a filesystem or database error occurred: {0}")]
    Io(String),
}

impl From<EntryError> for AccountError {
    fn from(error: EntryError) -> Self {
        match error {
            EntryError::InvalidStoredValue(message) | EntryError::Io(message) => {
                AccountError::Io(message)
            }
            // The account rules never create/edit/delete an entry directly —
            // only `usecases::entry` does — so these never actually occur
            // through this path; kept exhaustive rather than an unreachable!.
            other => AccountError::Io(other.to_string()),
        }
    }
}

impl From<InvalidAmount> for AccountError {
    fn from(error: InvalidAmount) -> Self {
        AccountError::InvalidAmount(error.to_string())
    }
}

impl From<InvalidDate> for AccountError {
    fn from(error: InvalidDate) -> Self {
        AccountError::InvalidDate(error.to_string())
    }
}

/// Persistence for accounts.
///
/// `create`, `update` and `delete` each carry the matching system-entry write
/// (derived from [`AccountDetails::system_entry`]) and are contractually
/// atomic: an implementation must apply both halves or neither, so an account
/// can never be observed without its opening balance.
pub trait AccountRepository {
    /// Inserts the account together with its opening-balance system entry.
    fn create(&self, details: &AccountDetails) -> Result<Account, AccountError>;

    /// Rewrites the account row and re-dates/re-values its system entry.
    fn update(&self, id: i64, details: &AccountDetails) -> Result<Account, AccountError>;

    fn set_archived(&self, id: i64, archived: bool) -> Result<Account, AccountError>;

    /// Removes the account and every entry belonging to it. Callers are
    /// responsible for the "no real activity" guard first.
    fn delete(&self, id: i64) -> Result<(), AccountError>;

    fn find(&self, id: i64) -> Result<Option<Account>, AccountError>;

    fn list(&self, archived: bool) -> Result<Vec<Account>, AccountError>;
}

pub type DynAccountRepository = Box<dyn AccountRepository + Send + Sync>;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::entry::EntryKind;

    fn details(opening_balance: i64) -> AccountDetails {
        AccountDetails {
            name: "Compte courant".to_owned(),
            color: "#3b82f6".to_owned(),
            icon: "wallet".to_owned(),
            created_date: IsoDate::parse("2026-01-15").unwrap(),
            opening_balance,
        }
    }

    #[test]
    fn the_system_entry_is_dated_at_the_opening_date() {
        assert_eq!(details(1_000).system_entry().date.as_str(), "2026-01-15");
    }

    #[test]
    fn a_negative_opening_balance_makes_the_system_entry_a_debit() {
        let entry = details(-25_000).system_entry();
        assert_eq!(entry.amount.kind, EntryKind::Debit);
        assert_eq!(entry.amount.amount, 25_000);
    }

    #[test]
    fn a_positive_opening_balance_makes_the_system_entry_a_credit() {
        let entry = details(25_000).system_entry();
        assert_eq!(entry.amount.kind, EntryKind::Credit);
        assert_eq!(entry.amount.amount, 25_000);
    }
}
