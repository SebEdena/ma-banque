//! Recurring-rule business rules: the label/interval/date-range/amount
//! validations, and the two genuinely different things an edit scope does.
//!
//! Amounts arrive here as the signed major-unit `f64` the form produced and
//! are converted to cents *here*, through the same `money::to_cents` helper
//! and with the same rejection rules as `usecases::entry::EntryInput`
//! (technical-architecture.md §1.3).

use crate::domain::date::IsoDate;
use crate::domain::entry::SignedCents;
use crate::domain::money;
use crate::domain::recurring::{
    next_occurrence_after, EditScope, Frequency, OccurrenceOverride, RecurringError, RecurringRule,
    RecurringRuleDetails, RecurringRuleRepository, RuleSchedule, RuleTemplate,
};

/// The rule form's input, exactly as it comes off the modal — the entry
/// template and the schedule flattened into one payload.
#[derive(Debug, Clone, PartialEq)]
pub struct RuleInput {
    pub label: String,
    pub category_id: Option<i64>,
    /// Major units, signed — negative is a debit, positive (including zero)
    /// a credit.
    pub amount: f64,
    pub description: String,
    pub frequency: Frequency,
    pub interval: u32,
    pub start_date: IsoDate,
    pub end_date: Option<IsoDate>,
}

impl RuleInput {
    fn validate(self) -> Result<RecurringRuleDetails, RecurringError> {
        let label = self.label.trim();
        if label.is_empty() {
            return Err(RecurringError::EmptyLabel);
        }
        if self.interval == 0 {
            return Err(RecurringError::InvalidInterval);
        }
        if self
            .end_date
            .as_ref()
            .is_some_and(|end| end < &self.start_date)
        {
            return Err(RecurringError::EndDateBeforeStartDate);
        }

        Ok(RecurringRuleDetails {
            template: RuleTemplate {
                label: label.to_owned(),
                category_id: self.category_id,
                amount: SignedCents::new(money::to_cents(self.amount)?),
                description: self.description.trim().to_owned(),
            },
            schedule: RuleSchedule {
                frequency: self.frequency,
                interval: self.interval,
                start_date: self.start_date,
                end_date: self.end_date,
            },
        })
    }
}

pub fn list_rules(
    rules: &dyn RecurringRuleRepository,
    account_id: i64,
) -> Result<Vec<RecurringRule>, RecurringError> {
    rules.list_by_account(account_id)
}

pub fn create_rule(
    rules: &dyn RecurringRuleRepository,
    account_id: i64,
    input: RuleInput,
) -> Result<RecurringRule, RecurringError> {
    rules.create(account_id, &input.validate()?)
}

/// Applies an edit, honouring `scope` — but only when the edit is a template
/// change. A schedule change is always `AllFuture` (user story 21) and
/// additionally discards the rule's outstanding overrides, since an override
/// is keyed to a date the new schedule may no longer land on.
///
/// Either way, already-generated entries are left exactly as they are: they
/// are independent rows and nothing in this path reads them.
pub fn update_rule(
    rules: &dyn RecurringRuleRepository,
    id: i64,
    input: RuleInput,
    scope: EditScope,
) -> Result<RecurringRule, RecurringError> {
    let details = input.validate()?;
    let current = rules.find(id)?.ok_or(RecurringError::NotFound)?;

    if current.schedule != details.schedule {
        let updated = rules.update(id, &details)?;
        rules.delete_overrides(id)?;
        return Ok(updated);
    }

    match scope {
        EditScope::AllFuture => rules.update(id, &details),
        EditScope::NextOccurrenceOnly => {
            let last_generated = rules.last_generated_date(id)?;
            if let Some(occurrence_date) =
                next_occurrence_after(&current.schedule, last_generated.as_ref())
            {
                rules.save_override(&OccurrenceOverride {
                    rule_id: id,
                    occurrence_date,
                    template: details.template,
                })?;
            }
            Ok(current)
        }
    }
}

/// Removes the rule; the entries it already generated stay (user story 24).
pub fn delete_rule(rules: &dyn RecurringRuleRepository, id: i64) -> Result<(), RecurringError> {
    rules.find(id)?.ok_or(RecurringError::NotFound)?;
    rules.delete(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    /// Stands in for both the rules table and the generated entries the
    /// rules point at — `generated` is only ever read here, never rewritten
    /// by a rule edit, which is exactly the invariant several tests assert.
    #[derive(Default)]
    struct FakeStore {
        rules: RefCell<Vec<RecurringRule>>,
        overrides: RefCell<Vec<OccurrenceOverride>>,
        generated: RefCell<Vec<(i64, IsoDate)>>,
        next_id: RefCell<i64>,
    }

    impl FakeStore {
        fn generated_occurrence(self, rule_id: i64, date: &str) -> Self {
            self.generated
                .borrow_mut()
                .push((rule_id, IsoDate::parse(date).unwrap()));
            self
        }
    }

    impl RecurringRuleRepository for FakeStore {
        fn list_by_account(&self, account_id: i64) -> Result<Vec<RecurringRule>, RecurringError> {
            Ok(self
                .rules
                .borrow()
                .iter()
                .filter(|r| r.account_id == account_id)
                .cloned()
                .collect())
        }

        fn find(&self, id: i64) -> Result<Option<RecurringRule>, RecurringError> {
            Ok(self.rules.borrow().iter().find(|r| r.id == id).cloned())
        }

        fn create(
            &self,
            account_id: i64,
            details: &RecurringRuleDetails,
        ) -> Result<RecurringRule, RecurringError> {
            let mut next = self.next_id.borrow_mut();
            *next += 1;
            let rule = RecurringRule {
                id: *next,
                account_id,
                template: details.template.clone(),
                schedule: details.schedule.clone(),
            };
            drop(next);
            self.rules.borrow_mut().push(rule.clone());
            Ok(rule)
        }

        fn update(
            &self,
            id: i64,
            details: &RecurringRuleDetails,
        ) -> Result<RecurringRule, RecurringError> {
            let mut rules = self.rules.borrow_mut();
            let rule = rules
                .iter_mut()
                .find(|r| r.id == id)
                .ok_or(RecurringError::NotFound)?;
            rule.template = details.template.clone();
            rule.schedule = details.schedule.clone();
            Ok(rule.clone())
        }

        fn delete(&self, id: i64) -> Result<(), RecurringError> {
            self.rules.borrow_mut().retain(|r| r.id != id);
            self.overrides.borrow_mut().retain(|o| o.rule_id != id);
            Ok(())
        }

        fn list_overrides(&self, rule_id: i64) -> Result<Vec<OccurrenceOverride>, RecurringError> {
            Ok(self
                .overrides
                .borrow()
                .iter()
                .filter(|o| o.rule_id == rule_id)
                .cloned()
                .collect())
        }

        fn save_override(&self, occurrence: &OccurrenceOverride) -> Result<(), RecurringError> {
            let mut overrides = self.overrides.borrow_mut();
            overrides.retain(|o| {
                o.rule_id != occurrence.rule_id || o.occurrence_date != occurrence.occurrence_date
            });
            overrides.push(occurrence.clone());
            Ok(())
        }

        fn delete_override(
            &self,
            rule_id: i64,
            occurrence_date: &IsoDate,
        ) -> Result<(), RecurringError> {
            self.overrides
                .borrow_mut()
                .retain(|o| o.rule_id != rule_id || &o.occurrence_date != occurrence_date);
            Ok(())
        }

        fn delete_overrides(&self, rule_id: i64) -> Result<(), RecurringError> {
            self.overrides.borrow_mut().retain(|o| o.rule_id != rule_id);
            Ok(())
        }

        fn last_generated_date(&self, rule_id: i64) -> Result<Option<IsoDate>, RecurringError> {
            Ok(self
                .generated
                .borrow()
                .iter()
                .filter(|(id, _)| *id == rule_id)
                .map(|(_, date)| date.clone())
                .max())
        }

        fn insert_occurrence_if_absent(
            &self,
            rule_id: i64,
            _account_id: i64,
            date: &IsoDate,
            _template: &RuleTemplate,
        ) -> Result<bool, RecurringError> {
            let mut generated = self.generated.borrow_mut();
            if generated.iter().any(|(id, d)| *id == rule_id && d == date) {
                return Ok(false);
            }
            generated.push((rule_id, date.clone()));
            Ok(true)
        }
    }

    fn input(label: &str, amount: f64) -> RuleInput {
        RuleInput {
            label: label.to_owned(),
            category_id: None,
            amount,
            description: String::new(),
            frequency: Frequency::Monthly,
            interval: 1,
            start_date: IsoDate::parse("2026-03-01").unwrap(),
            end_date: None,
        }
    }

    #[test]
    fn creating_a_rule_derives_the_kind_from_the_amounts_sign() {
        let store = FakeStore::default();

        let debit = create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        let credit = create_rule(&store, 1, input("Salaire", 2_100.0)).unwrap();

        assert_eq!(debit.template.amount.to_cents(), -75_000);
        assert_eq!(credit.template.amount.to_cents(), 210_000);
    }

    #[test]
    fn creating_a_rule_trims_its_label_and_description() {
        let store = FakeStore::default();

        let created = create_rule(
            &store,
            1,
            RuleInput {
                label: "  Loyer  ".to_owned(),
                description: "  studio  ".to_owned(),
                ..input("ignored", -750.0)
            },
        )
        .unwrap();

        assert_eq!(created.template.label, "Loyer");
        assert_eq!(created.template.description, "studio");
    }

    #[test]
    fn a_blank_label_is_rejected() {
        let store = FakeStore::default();

        for label in ["", "   "] {
            let err = create_rule(&store, 1, input(label, -750.0)).unwrap_err();
            assert_eq!(err, RecurringError::EmptyLabel);
        }
        assert!(store.rules.borrow().is_empty());
    }

    #[test]
    fn an_interval_below_one_is_rejected() {
        let store = FakeStore::default();

        let err = create_rule(
            &store,
            1,
            RuleInput {
                interval: 0,
                ..input("Loyer", -750.0)
            },
        )
        .unwrap_err();

        assert_eq!(err, RecurringError::InvalidInterval);
        assert!(store.rules.borrow().is_empty());
    }

    #[test]
    fn an_end_date_before_the_start_date_is_rejected() {
        let store = FakeStore::default();

        let err = create_rule(
            &store,
            1,
            RuleInput {
                end_date: Some(IsoDate::parse("2026-02-28").unwrap()),
                ..input("Loyer", -750.0)
            },
        )
        .unwrap_err();

        assert_eq!(err, RecurringError::EndDateBeforeStartDate);
    }

    #[test]
    fn an_end_date_equal_to_the_start_date_is_accepted() {
        let store = FakeStore::default();

        let created = create_rule(
            &store,
            1,
            RuleInput {
                end_date: Some(IsoDate::parse("2026-03-01").unwrap()),
                ..input("Prime", 500.0)
            },
        )
        .unwrap();

        assert_eq!(
            created.schedule.end_date.map(|d| d.to_string()),
            Some("2026-03-01".to_owned())
        );
    }

    #[test]
    fn an_amount_finer_than_a_cent_is_rejected() {
        let store = FakeStore::default();

        let err = create_rule(&store, 1, input("Loyer", -750.005)).unwrap_err();

        assert!(matches!(err, RecurringError::InvalidAmount(_)));
    }

    #[test]
    fn listing_returns_only_that_accounts_rules() {
        let store = FakeStore::default();
        create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        create_rule(&store, 2, input("Salaire", 2_100.0)).unwrap();

        let rules = list_rules(&store, 1).unwrap();

        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].template.label, "Loyer");
    }

    #[test]
    fn updating_an_unknown_rule_reports_it_as_missing() {
        let store = FakeStore::default();

        let err =
            update_rule(&store, 404, input("Loyer", -750.0), EditScope::AllFuture).unwrap_err();

        assert_eq!(err, RecurringError::NotFound);
    }

    #[test]
    fn all_future_mutates_the_rule_and_leaves_generated_entries_untouched() {
        let store = FakeStore::default();
        let created = create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        store
            .generated
            .borrow_mut()
            .push((created.id, IsoDate::parse("2026-03-01").unwrap()));

        let updated = update_rule(
            &store,
            created.id,
            input("Loyer", -800.0),
            EditScope::AllFuture,
        )
        .unwrap();

        assert_eq!(updated.template.amount.to_cents(), -80_000);
        assert_eq!(
            store.rules.borrow()[0].template.amount.to_cents(),
            -80_000,
            "the stored rule should carry the new amount"
        );
        assert_eq!(
            store.generated.borrow().len(),
            1,
            "already-generated entries are independent rows"
        );
    }

    #[test]
    fn next_occurrence_only_leaves_the_rule_untouched_and_overrides_the_first_occurrence() {
        let store = FakeStore::default();
        let created = create_rule(&store, 1, input("Loyer", -750.0)).unwrap();

        update_rule(
            &store,
            created.id,
            input("Loyer", -800.0),
            EditScope::NextOccurrenceOnly,
        )
        .unwrap();

        assert_eq!(
            store.rules.borrow()[0].template.amount.to_cents(),
            -75_000,
            "the rule itself keeps its amount"
        );
        let overrides = store.list_overrides(created.id).unwrap();
        assert_eq!(overrides.len(), 1);
        assert_eq!(overrides[0].occurrence_date.as_str(), "2026-03-01");
        assert_eq!(overrides[0].template.amount.to_cents(), -80_000);
    }

    #[test]
    fn next_occurrence_only_keys_the_override_after_the_last_generated_occurrence() {
        let store = FakeStore::default();
        let created = create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        let store = store
            .generated_occurrence(created.id, "2026-03-01")
            .generated_occurrence(created.id, "2026-04-01");

        update_rule(
            &store,
            created.id,
            input("Loyer", -800.0),
            EditScope::NextOccurrenceOnly,
        )
        .unwrap();

        let overrides = store.list_overrides(created.id).unwrap();
        assert_eq!(overrides[0].occurrence_date.as_str(), "2026-05-01");
    }

    #[test]
    fn a_second_next_occurrence_only_edit_replaces_the_first_override() {
        let store = FakeStore::default();
        let created = create_rule(&store, 1, input("Loyer", -750.0)).unwrap();

        for amount in [-800.0, -820.0] {
            update_rule(
                &store,
                created.id,
                input("Loyer", amount),
                EditScope::NextOccurrenceOnly,
            )
            .unwrap();
        }

        let overrides = store.list_overrides(created.id).unwrap();
        assert_eq!(overrides.len(), 1);
        assert_eq!(overrides[0].template.amount.to_cents(), -82_000);
    }

    #[test]
    fn a_schedule_change_discards_the_rules_outstanding_overrides() {
        let store = FakeStore::default();
        let created = create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        update_rule(
            &store,
            created.id,
            input("Loyer", -800.0),
            EditScope::NextOccurrenceOnly,
        )
        .unwrap();
        assert_eq!(store.list_overrides(created.id).unwrap().len(), 1);

        update_rule(
            &store,
            created.id,
            RuleInput {
                interval: 2,
                ..input("Loyer", -750.0)
            },
            EditScope::AllFuture,
        )
        .unwrap();

        assert!(store.list_overrides(created.id).unwrap().is_empty());
    }

    /// A schedule change is always `AllFuture`, even when the caller asks
    /// for `NextOccurrenceOnly` — user story 21.
    #[test]
    fn a_schedule_change_mutates_the_rule_whatever_scope_is_requested() {
        let store = FakeStore::default();
        let created = create_rule(&store, 1, input("Loyer", -750.0)).unwrap();

        update_rule(
            &store,
            created.id,
            RuleInput {
                frequency: Frequency::Yearly,
                ..input("Loyer", -750.0)
            },
            EditScope::NextOccurrenceOnly,
        )
        .unwrap();

        assert_eq!(
            store.rules.borrow()[0].schedule.frequency,
            Frequency::Yearly
        );
        assert!(store.list_overrides(created.id).unwrap().is_empty());
    }

    #[test]
    fn deleting_a_rule_leaves_the_entries_it_generated_in_place() {
        let store = FakeStore::default();
        let created = create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        let store = store.generated_occurrence(created.id, "2026-03-01");

        delete_rule(&store, created.id).unwrap();

        assert!(store.rules.borrow().is_empty());
        assert_eq!(store.generated.borrow().len(), 1);
    }

    #[test]
    fn deleting_an_unknown_rule_reports_it_as_missing() {
        let store = FakeStore::default();

        let err = delete_rule(&store, 404).unwrap_err();

        assert_eq!(err, RecurringError::NotFound);
    }
}
