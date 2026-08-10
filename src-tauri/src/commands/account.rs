//! Tauri commands exposing accounts to Angular.
//!
//! This is where cents become the major-unit numbers the UI displays: every
//! amount is divided exactly once, here, right before serialization
//! (technical-architecture.md §1.3). Amounts coming *in* are passed through
//! untouched as the `f64` the user typed — `usecases::account` owns the
//! rounding back to cents.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::domain::account::{AccountError, DynAccountRepository};
use crate::domain::date::IsoDate;
use crate::domain::entry::DynEntryRepository;
use crate::domain::money;
use crate::usecases::account::{self as usecases, AccountInput, AccountSummary};

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct AccountView {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub created_date: String,
    /// Major units.
    pub opening_balance: f64,
    /// Major units.
    pub balance: f64,
    pub archived: bool,
    pub last_entry_date: Option<String>,
}

impl From<AccountSummary> for AccountView {
    fn from(summary: AccountSummary) -> Self {
        let AccountSummary {
            account,
            balance,
            last_entry_date,
        } = summary;

        Self {
            id: account.id,
            name: account.name,
            color: account.color,
            icon: account.icon,
            created_date: account.created_date.to_string(),
            opening_balance: money::to_major(account.opening_balance),
            balance: money::to_major(balance),
            archived: account.archived,
            last_entry_date: last_entry_date.map(|date| date.to_string()),
        }
    }
}

/// The settings modal's form, as it comes off the wire: `opening_balance` is
/// the major-unit value the user typed, and `created_date` stays a raw
/// string so a malformed date surfaces as an `AccountError` rather than a
/// deserialization failure Angular can't tell apart from the others.
#[derive(Debug, Clone, Deserialize)]
pub struct AccountInputPayload {
    pub name: String,
    pub color: String,
    pub icon: String,
    pub created_date: String,
    pub opening_balance: f64,
}

impl TryFrom<AccountInputPayload> for AccountInput {
    type Error = AccountError;

    fn try_from(payload: AccountInputPayload) -> Result<Self, Self::Error> {
        Ok(AccountInput {
            name: payload.name,
            color: payload.color,
            icon: payload.icon,
            created_date: IsoDate::parse(&payload.created_date)?,
            opening_balance: payload.opening_balance,
        })
    }
}

#[tauri::command]
pub fn list_active_accounts(
    accounts: State<DynAccountRepository>,
    entries: State<DynEntryRepository>,
) -> Result<Vec<AccountView>, AccountError> {
    Ok(usecases::list_active_accounts(&**accounts, &**entries)?
        .into_iter()
        .map(AccountView::from)
        .collect())
}

#[tauri::command]
pub fn list_archived_accounts(
    accounts: State<DynAccountRepository>,
    entries: State<DynEntryRepository>,
) -> Result<Vec<AccountView>, AccountError> {
    Ok(usecases::list_archived_accounts(&**accounts, &**entries)?
        .into_iter()
        .map(AccountView::from)
        .collect())
}

#[tauri::command]
pub fn create_account(
    accounts: State<DynAccountRepository>,
    entries: State<DynEntryRepository>,
    input: AccountInputPayload,
) -> Result<AccountView, AccountError> {
    usecases::create_account(&**accounts, &**entries, input.try_into()?).map(AccountView::from)
}

#[tauri::command]
pub fn update_account(
    accounts: State<DynAccountRepository>,
    entries: State<DynEntryRepository>,
    id: i64,
    input: AccountInputPayload,
) -> Result<AccountView, AccountError> {
    usecases::update_account(&**accounts, &**entries, id, input.try_into()?).map(AccountView::from)
}

/// Archiving moves an account between the two lists the caller is showing,
/// so it reports nothing back: the caller refetches both lists either way.
#[tauri::command]
pub fn archive_account(accounts: State<DynAccountRepository>, id: i64) -> Result<(), AccountError> {
    usecases::archive_account(&**accounts, id).map(|_| ())
}

#[tauri::command]
pub fn unarchive_account(
    accounts: State<DynAccountRepository>,
    id: i64,
) -> Result<(), AccountError> {
    usecases::unarchive_account(&**accounts, id).map(|_| ())
}

#[tauri::command]
pub fn delete_account(
    accounts: State<DynAccountRepository>,
    entries: State<DynEntryRepository>,
    id: i64,
) -> Result<(), AccountError> {
    usecases::delete_account(&**accounts, &**entries, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::account::Account;

    fn summary(opening_balance: i64, balance: i64) -> AccountSummary {
        AccountSummary {
            account: Account {
                id: 1,
                name: "Livret A".to_owned(),
                color: "#3b82f6".to_owned(),
                icon: "wallet".to_owned(),
                created_date: IsoDate::parse("2026-01-15").unwrap(),
                opening_balance,
                archived: false,
                last_viewed_date: None,
            },
            balance,
            last_entry_date: Some(IsoDate::parse("2026-02-01").unwrap()),
        }
    }

    #[test]
    fn amounts_cross_the_boundary_as_major_units() {
        let view = AccountView::from(summary(123_456, 98_450));

        assert_eq!(view.opening_balance, 1_234.56);
        assert_eq!(view.balance, 984.50);
    }

    #[test]
    fn dates_cross_the_boundary_as_iso_strings() {
        let view = AccountView::from(summary(0, 0));

        assert_eq!(view.created_date, "2026-01-15");
        assert_eq!(view.last_entry_date.as_deref(), Some("2026-02-01"));
    }

    #[test]
    fn a_malformed_opening_date_is_reported_as_an_account_error() {
        let payload = AccountInputPayload {
            name: "Livret A".to_owned(),
            color: "#3b82f6".to_owned(),
            icon: "wallet".to_owned(),
            created_date: "15/01/2026".to_owned(),
            opening_balance: 0.0,
        };

        let err = AccountInput::try_from(payload).unwrap_err();

        assert!(matches!(err, AccountError::InvalidDate(_)));
    }
}
