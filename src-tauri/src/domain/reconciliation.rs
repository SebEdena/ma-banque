//! Reconciliation (_pointage_): comparing what the register says an account
//! holds against what the bank's statement says it holds.
//!
//! There is no new entity here. `08-reconciliation.md` keeps the whole
//! feature on two nullable `accounts` columns plus aggregates over the
//! `reconciled` flag `06-entries.md` already ships — so this module carries
//! the two stored values, the summary they roll up into, and the pure
//! arithmetic at the heart of the feature.

use serde::Serialize;
use thiserror::Error;

use crate::domain::date::{InvalidDate, IsoDate};
use crate::domain::entry::EntryError;
use crate::domain::money::InvalidAmount;

/// How far the bank's balance sits from the register's reconciled balance,
/// in cents. Positive means the bank holds more than the register accounts
/// for (an entry is missing); negative means it holds less (a duplicate, or
/// something not yet cleared).
pub fn delta(bank_balance: i64, reconciled_balance: i64) -> i64 {
    bank_balance - reconciled_balance
}

/// The feature's central claim: green means *exactly* zero, never "close
/// enough". Both operands are integer cents, so exact equality is a
/// meaningful test rather than a floating-point trap.
pub fn is_balanced(delta: i64) -> bool {
    delta == 0
}

/// The two values an account stores for reconciliation. Both are `None`
/// until the user sets them, and every account predating
/// `0007_accounts_reconciliation.sql` starts there.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ReconciliationSettings {
    /// Cents.
    pub bank_balance: Option<i64>,
    pub statement_date: Option<IsoDate>,
}

/// Everything the reconciliation panel displays, in one shape — one command,
/// one round trip, so the panel never assembles a view from three calls that
/// could disagree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReconciliationSummary {
    pub statement_date: Option<IsoDate>,
    /// Cents.
    pub bank_balance: Option<i64>,
    /// Cents. `None` without a statement date — there is no defensible
    /// cut-off to sum up to, and a guessed one would look like a fact.
    pub reconciled_balance: Option<i64>,
    /// Cents. `None` unless both balances are present.
    pub delta: Option<i64>,
    /// False whenever `delta` is absent: an account missing either input
    /// isn't balanced, it's unanswered.
    pub is_balanced: bool,
    pub unreconciled_count: i64,
}

#[derive(Debug, Error, Serialize, PartialEq, Eq, Clone)]
#[serde(tag = "kind", content = "message")]
pub enum ReconciliationError {
    #[error("no such account")]
    UnknownAccount,
    #[error("invalid amount: {0}")]
    InvalidAmount(String),
    #[error("invalid date: {0}")]
    InvalidDate(String),
    #[error("a filesystem or database error occurred: {0}")]
    Io(String),
}

impl From<InvalidAmount> for ReconciliationError {
    fn from(error: InvalidAmount) -> Self {
        ReconciliationError::InvalidAmount(error.to_string())
    }
}

impl From<InvalidDate> for ReconciliationError {
    fn from(error: InvalidDate) -> Self {
        ReconciliationError::InvalidDate(error.to_string())
    }
}

impl From<EntryError> for ReconciliationError {
    fn from(error: EntryError) -> Self {
        // The reconciliation rules only ever *read* through
        // `EntryRepository`, so nothing but a storage failure can reach
        // here; kept total rather than an `unreachable!`.
        ReconciliationError::Io(error.to_string())
    }
}

/// The two stored reconciliation values, and nothing else.
///
/// Deliberately **not** folded into `AccountRepository`: that trait's
/// `create`/`update` are contractually atomic with the account's system-entry
/// write and are driven by `AccountDetails`, the single shape behind the
/// create/edit settings modal. These two fields are edited from the
/// reconciliation panel, one at a time, and must not be dragged into that
/// modal's contract or into the opening-date/opening-balance transaction.
pub trait ReconciliationRepository {
    /// The account's stored settings, or `None` if no such account exists.
    fn find_settings(
        &self,
        account_id: i64,
    ) -> Result<Option<ReconciliationSettings>, ReconciliationError>;

    /// Stores the bank statement's balance, in cents.
    fn set_bank_balance(
        &self,
        account_id: i64,
        bank_balance: i64,
    ) -> Result<(), ReconciliationError>;

    /// Stores the statement's cut-off date.
    fn set_statement_date(
        &self,
        account_id: i64,
        statement_date: &IsoDate,
    ) -> Result<(), ReconciliationError>;
}

pub type DynReconciliationRepository = Box<dyn ReconciliationRepository + Send + Sync>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bank_balance_above_the_register_is_a_positive_delta() {
        assert_eq!(delta(100_000, 98_450), 1_550);
        assert!(!is_balanced(delta(100_000, 98_450)));
    }

    #[test]
    fn a_bank_balance_below_the_register_is_a_negative_delta() {
        assert_eq!(delta(98_450, 100_000), -1_550);
        assert!(!is_balanced(delta(98_450, 100_000)));
    }

    #[test]
    fn exactly_equal_balances_are_balanced() {
        assert_eq!(delta(98_450, 98_450), 0);
        assert!(is_balanced(delta(98_450, 98_450)));
    }

    #[test]
    fn two_negative_balances_still_subtract_in_the_stated_order() {
        assert_eq!(delta(-100_000, -98_450), -1_550);
        assert_eq!(delta(-98_450, -100_000), 1_550);
        assert!(is_balanced(delta(-100_000, -100_000)));
    }

    #[test]
    fn two_zero_balances_are_balanced() {
        assert_eq!(delta(0, 0), 0);
        assert!(is_balanced(delta(0, 0)));
    }

    #[test]
    fn a_single_cent_apart_is_not_balanced() {
        assert!(!is_balanced(delta(98_451, 98_450)));
        assert!(!is_balanced(delta(98_449, 98_450)));
    }

    #[test]
    fn a_delta_across_the_sign_boundary_keeps_its_direction() {
        // An overdrawn register against a bank that says the account is in
        // credit: the bank holds more, so the delta is positive.
        assert_eq!(delta(5_000, -5_000), 10_000);
        assert_eq!(delta(-5_000, 5_000), -10_000);
    }
}
