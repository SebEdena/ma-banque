//! Tauri commands exposing recurring rules to Angular.
//!
//! Same wire-boundary rules as `commands::entry`: cents become the
//! major-unit, signed number the UI displays and edits, and dates cross as
//! `YYYY-MM-DD` strings (technical-architecture.md §1.3). `frequency` and
//! `scope` likewise stay raw strings on the way in, so an unrecognized value
//! surfaces as a `RecurringError` Angular can handle alongside the others
//! rather than a deserialization failure it can't tell apart.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::domain::account::DynAccountRepository;
use crate::domain::date::IsoDate;
use crate::domain::money;
use crate::domain::recurring::{
    DynRecurringRuleRepository, EditScope, Frequency, RecurringError, RecurringRule,
};
use crate::infra::clock;
use crate::usecases::recurring::{self as usecases, RuleInput};

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RecurringRuleView {
    pub id: i64,
    pub account_id: i64,
    pub label: String,
    pub category_id: Option<i64>,
    /// Major units, signed — negative is a debit, positive (including zero)
    /// a credit.
    pub amount: f64,
    pub description: String,
    pub frequency: Frequency,
    pub interval: u32,
    pub start_date: String,
    pub end_date: Option<String>,
}

impl From<RecurringRule> for RecurringRuleView {
    fn from(rule: RecurringRule) -> Self {
        Self {
            id: rule.id,
            account_id: rule.account_id,
            label: rule.template.label,
            category_id: rule.template.category_id,
            amount: money::to_major(rule.template.amount.to_cents()),
            description: rule.template.description,
            frequency: rule.schedule.frequency,
            interval: rule.schedule.interval,
            start_date: rule.schedule.start_date.to_string(),
            end_date: rule.schedule.end_date.map(|d| d.to_string()),
        }
    }
}

/// The rule form, as it comes off the wire — the entry template and the
/// schedule flattened into one payload, mirroring the modal's own shape.
#[derive(Debug, Clone, Deserialize)]
pub struct RecurringRuleInputPayload {
    pub label: String,
    pub category_id: Option<i64>,
    pub amount: f64,
    pub description: String,
    pub frequency: String,
    pub interval: u32,
    pub start_date: String,
    pub end_date: Option<String>,
}

impl TryFrom<RecurringRuleInputPayload> for RuleInput {
    type Error = RecurringError;

    fn try_from(payload: RecurringRuleInputPayload) -> Result<Self, Self::Error> {
        let parse_date = |raw: &str| {
            IsoDate::parse(raw).map_err(|e| RecurringError::InvalidStoredValue(e.to_string()))
        };

        Ok(RuleInput {
            label: payload.label,
            category_id: payload.category_id,
            amount: payload.amount,
            description: payload.description,
            frequency: Frequency::parse(&payload.frequency)?,
            interval: payload.interval,
            start_date: parse_date(&payload.start_date)?,
            end_date: payload.end_date.as_deref().map(parse_date).transpose()?,
        })
    }
}

#[tauri::command]
pub fn list_recurring_rules(
    rules: State<DynRecurringRuleRepository>,
    account_id: i64,
) -> Result<Vec<RecurringRuleView>, RecurringError> {
    usecases::list_rules(&**rules, account_id)
        .map(|rules| rules.into_iter().map(RecurringRuleView::from).collect())
}

#[tauri::command]
pub fn create_recurring_rule(
    rules: State<DynRecurringRuleRepository>,
    account_id: i64,
    input: RecurringRuleInputPayload,
) -> Result<RecurringRuleView, RecurringError> {
    usecases::create_rule(&**rules, account_id, input.try_into()?).map(RecurringRuleView::from)
}

#[tauri::command]
pub fn update_recurring_rule(
    rules: State<DynRecurringRuleRepository>,
    id: i64,
    input: RecurringRuleInputPayload,
    scope: String,
) -> Result<RecurringRuleView, RecurringError> {
    usecases::update_rule(&**rules, id, input.try_into()?, EditScope::parse(&scope)?)
        .map(RecurringRuleView::from)
}

#[tauri::command]
pub fn delete_recurring_rule(
    rules: State<DynRecurringRuleRepository>,
    id: i64,
) -> Result<(), RecurringError> {
    usecases::delete_rule(&**rules, id)
}

/// Brings one account's register up to today and reports how many entries
/// that took, so the screen can explain the ones that just appeared (user
/// story 13).
///
/// The name says what the frontend is reporting, not what the backend does
/// with it: stamping `last_viewed_date` is today's whole payload, and a later
/// spec may well want more to happen when an account is opened.
#[tauri::command]
pub fn open_account(
    rules: State<DynRecurringRuleRepository>,
    accounts: State<DynAccountRepository>,
    account_id: i64,
) -> Result<usize, RecurringError> {
    usecases::generate_due_for_account(&**rules, &**accounts, account_id, &clock::today())
}

/// The startup sweep. Returns nothing — the home screen simply reads correct
/// balances once it resolves.
#[tauri::command]
pub fn generate_all_due_entries(
    rules: State<DynRecurringRuleRepository>,
    accounts: State<DynAccountRepository>,
) -> Result<(), RecurringError> {
    usecases::generate_due_for_all(&**accounts, &**rules, &clock::today()).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::entry::SignedCents;
    use crate::domain::recurring::{RuleSchedule, RuleTemplate};

    fn rule(amount_cents: i64, end_date: Option<&str>) -> RecurringRule {
        RecurringRule {
            id: 1,
            account_id: 7,
            template: RuleTemplate {
                label: "Loyer".to_owned(),
                category_id: Some(3),
                amount: SignedCents::new(amount_cents),
                description: "studio".to_owned(),
            },
            schedule: RuleSchedule {
                frequency: Frequency::Monthly,
                interval: 2,
                start_date: IsoDate::parse("2026-03-01").unwrap(),
                end_date: end_date.map(|d| IsoDate::parse(d).unwrap()),
            },
        }
    }

    fn payload() -> RecurringRuleInputPayload {
        RecurringRuleInputPayload {
            label: "Loyer".to_owned(),
            category_id: None,
            amount: -750.0,
            description: String::new(),
            frequency: "MONTHLY".to_owned(),
            interval: 1,
            start_date: "2026-03-01".to_owned(),
            end_date: None,
        }
    }

    #[test]
    fn a_debit_crosses_the_boundary_as_a_negative_major_unit_amount() {
        assert_eq!(RecurringRuleView::from(rule(-75_000, None)).amount, -750.0);
    }

    #[test]
    fn a_credit_crosses_the_boundary_as_a_positive_major_unit_amount() {
        assert_eq!(RecurringRuleView::from(rule(210_000, None)).amount, 2_100.0);
    }

    #[test]
    fn every_field_crosses_the_boundary() {
        let view = RecurringRuleView::from(rule(-75_000, Some("2026-12-01")));

        assert_eq!(view.id, 1);
        assert_eq!(view.account_id, 7);
        assert_eq!(view.label, "Loyer");
        assert_eq!(view.category_id, Some(3));
        assert_eq!(view.description, "studio");
        assert_eq!(view.frequency, Frequency::Monthly);
        assert_eq!(view.interval, 2);
        assert_eq!(view.start_date, "2026-03-01");
        assert_eq!(view.end_date.as_deref(), Some("2026-12-01"));
    }

    #[test]
    fn an_absent_end_date_crosses_the_boundary_as_null() {
        assert_eq!(RecurringRuleView::from(rule(-75_000, None)).end_date, None);
    }

    #[test]
    fn a_frequency_crosses_the_boundary_as_its_stored_string() {
        let json = serde_json::to_value(RecurringRuleView::from(rule(-75_000, None))).unwrap();

        assert_eq!(json["frequency"], "MONTHLY");
    }

    #[test]
    fn a_well_formed_payload_becomes_a_rule_input() {
        let input = RuleInput::try_from(RecurringRuleInputPayload {
            end_date: Some("2026-12-01".to_owned()),
            ..payload()
        })
        .unwrap();

        assert_eq!(input.frequency, Frequency::Monthly);
        assert_eq!(input.start_date.as_str(), "2026-03-01");
        assert_eq!(
            input.end_date.map(|d| d.to_string()),
            Some("2026-12-01".to_owned())
        );
    }

    #[test]
    fn a_malformed_start_date_is_reported_as_a_recurring_error() {
        let err = RuleInput::try_from(RecurringRuleInputPayload {
            start_date: "01/03/2026".to_owned(),
            ..payload()
        })
        .unwrap_err();

        assert!(matches!(err, RecurringError::InvalidStoredValue(_)));
    }

    #[test]
    fn a_malformed_end_date_is_reported_as_a_recurring_error() {
        let err = RuleInput::try_from(RecurringRuleInputPayload {
            end_date: Some("31/12/2026".to_owned()),
            ..payload()
        })
        .unwrap_err();

        assert!(matches!(err, RecurringError::InvalidStoredValue(_)));
    }

    #[test]
    fn an_unknown_frequency_is_reported_as_a_recurring_error() {
        let err = RuleInput::try_from(RecurringRuleInputPayload {
            frequency: "FORTNIGHTLY".to_owned(),
            ..payload()
        })
        .unwrap_err();

        assert!(matches!(err, RecurringError::InvalidStoredValue(_)));
    }
}
