//! Tauri commands exposing the reconciliation panel's figures to Angular.
//!
//! Amounts are divided once here, on the way out, exactly as
//! `commands::account`/`commands::entry` already do — everything behind this
//! boundary is integer cents (technical-architecture.md §1.3).

use serde::Serialize;
use tauri::State;

use crate::domain::entry::DynEntryRepository;
use crate::domain::money;
use crate::domain::reconciliation::{
    DynReconciliationRepository, ReconciliationError, ReconciliationSummary,
};
use crate::usecases::reconciliation as usecases;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ReconciliationSummaryView {
    pub statement_date: Option<String>,
    /// Major units. `None` until the user types one in.
    pub bank_balance: Option<f64>,
    /// Major units. `None` without a statement date to sum up to.
    pub reconciled_balance: Option<f64>,
    /// Major units, signed: positive means the bank holds more than the
    /// register accounts for.
    pub delta: Option<f64>,
    pub is_balanced: bool,
    pub unreconciled_count: i64,
}

impl From<ReconciliationSummary> for ReconciliationSummaryView {
    fn from(summary: ReconciliationSummary) -> Self {
        Self {
            statement_date: summary.statement_date.map(|date| date.to_string()),
            bank_balance: summary.bank_balance.map(money::to_major),
            reconciled_balance: summary.reconciled_balance.map(money::to_major),
            delta: summary.delta.map(money::to_major),
            is_balanced: summary.is_balanced,
            unreconciled_count: summary.unreconciled_count,
        }
    }
}

#[tauri::command]
pub fn reconciliation_summary(
    reconciliation: State<DynReconciliationRepository>,
    entries: State<DynEntryRepository>,
    account_id: i64,
) -> Result<ReconciliationSummaryView, ReconciliationError> {
    usecases::reconciliation_summary(&**reconciliation, &**entries, account_id)
        .map(ReconciliationSummaryView::from)
}

#[tauri::command]
pub fn set_bank_balance(
    reconciliation: State<DynReconciliationRepository>,
    entries: State<DynEntryRepository>,
    account_id: i64,
    amount: f64,
) -> Result<ReconciliationSummaryView, ReconciliationError> {
    usecases::set_bank_balance(&**reconciliation, &**entries, account_id, amount)
        .map(ReconciliationSummaryView::from)
}

/// `date` stays a raw string so a malformed one surfaces as a
/// [`ReconciliationError::InvalidDate`] the panel can display, rather than a
/// deserialization failure Angular can't tell apart from the others.
#[tauri::command]
pub fn set_statement_date(
    reconciliation: State<DynReconciliationRepository>,
    entries: State<DynEntryRepository>,
    account_id: i64,
    date: String,
) -> Result<ReconciliationSummaryView, ReconciliationError> {
    usecases::set_statement_date(&**reconciliation, &**entries, account_id, &date)
        .map(ReconciliationSummaryView::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::date::IsoDate;

    fn summary(
        bank_balance: Option<i64>,
        reconciled_balance: Option<i64>,
    ) -> ReconciliationSummary {
        let delta = bank_balance
            .zip(reconciled_balance)
            .map(|(bank, reconciled)| crate::domain::reconciliation::delta(bank, reconciled));

        ReconciliationSummary {
            statement_date: Some(IsoDate::parse("2026-02-28").unwrap()),
            bank_balance,
            reconciled_balance,
            delta,
            is_balanced: delta == Some(0),
            unreconciled_count: 3,
        }
    }

    #[test]
    fn every_amount_crosses_the_boundary_in_major_units() {
        let view = ReconciliationSummaryView::from(summary(Some(100_000), Some(98_450)));

        assert_eq!(view.bank_balance, Some(1_000.0));
        assert_eq!(view.reconciled_balance, Some(984.50));
        assert_eq!(view.delta, Some(15.50));
        assert_eq!(view.statement_date, Some("2026-02-28".to_owned()));
        assert!(!view.is_balanced);
        assert_eq!(view.unreconciled_count, 3);
    }

    #[test]
    fn a_negative_delta_keeps_its_sign_across_the_boundary() {
        let view = ReconciliationSummaryView::from(summary(Some(96_900), Some(98_450)));

        assert_eq!(view.delta, Some(-15.50));
    }

    #[test]
    fn a_zero_delta_crosses_as_balanced() {
        let view = ReconciliationSummaryView::from(summary(Some(98_450), Some(98_450)));

        assert_eq!(view.delta, Some(0.0));
        assert!(view.is_balanced);
    }

    #[test]
    fn absent_amounts_stay_absent_rather_than_becoming_zero() {
        let view = ReconciliationSummaryView::from(summary(None, None));

        assert_eq!(view.bank_balance, None);
        assert_eq!(view.reconciled_balance, None);
        assert_eq!(view.delta, None);
        assert!(!view.is_balanced);
    }

    #[test]
    fn an_absent_statement_date_crosses_as_null() {
        let view = ReconciliationSummaryView::from(ReconciliationSummary {
            statement_date: None,
            ..summary(Some(98_450), None)
        });

        assert_eq!(view.statement_date, None);
        assert_eq!(view.reconciled_balance, None);
        assert_eq!(view.delta, None);
    }

    #[test]
    fn every_error_serializes_as_a_kind_angular_can_branch_on() {
        assert_eq!(
            serde_json::to_value(ReconciliationError::UnknownAccount).unwrap(),
            serde_json::json!({ "kind": "UnknownAccount" })
        );
        assert_eq!(
            serde_json::to_value(ReconciliationError::InvalidAmount("nope".to_owned())).unwrap(),
            serde_json::json!({ "kind": "InvalidAmount", "message": "nope" })
        );
    }
}
