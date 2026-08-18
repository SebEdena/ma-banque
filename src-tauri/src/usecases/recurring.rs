//! Recurring-rule business rules: the label/interval/date-range/amount
//! validations, and the two genuinely different things an edit scope does.
//!
//! Amounts arrive here as the signed major-unit `f64` the form produced and
//! are converted to cents *here*, through the same `money::to_cents` helper
//! and with the same rejection rules as `usecases::entry::EntryInput`
//! (technical-architecture.md §1.3).

use crate::domain::account::AccountRepository;
use crate::domain::date::IsoDate;
use crate::domain::entry::SignedCents;
use crate::domain::money;
use crate::domain::recurring::{
    next_occurrence_after, occurrences_between, EditScope, Frequency, OccurrenceOverride,
    RecurringError, RecurringRule, RecurringRuleDetails, RecurringRuleRepository, RuleSchedule,
    RuleTemplate,
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

/// Writes every occurrence of `account_id`'s rules due up to and including
/// `today`, and returns how many entries that produced.
///
/// The window is `[last_viewed_date, today]`, inclusive at both ends, for
/// any rule that has already generated at least one occurrence. A rule that
/// has generated nothing opens its window at its own start date instead —
/// as does every rule when the account has never been stamped — which is
/// what makes adding a rule with a start date in the past backfill the whole
/// run (user story 6). `occurrences_between` clips each rule to its own
/// `[start_date, end_date]`, so a rule outside the window yields nothing.
///
/// `today` is a parameter rather than a clock read: the command layer
/// resolves it once per invocation, and every case below is deterministic
/// under test as a result.
///
/// **Idempotency is enforced twice, deliberately.** The stamp is the primary
/// mechanism — a second run on the same day computes `[today, today]` and
/// finds its occurrences already written — and the repository's
/// insert-if-absent is the backstop. The failure being defended against is
/// duplicated money in the user's register, so a window bug degrades into
/// "generates nothing extra" rather than "generates the rent twice".
///
/// An **archived account generates nothing and is not stamped** (user story
/// 25). Leaving its stamp stale is the point: unarchiving then backfills the
/// period the account spent archived, which is right, because the commitment
/// behind the rule did not pause.
pub fn generate_due_for_account(
    rules: &dyn RecurringRuleRepository,
    accounts: &dyn AccountRepository,
    account_id: i64,
    today: &IsoDate,
) -> Result<usize, RecurringError> {
    let account = accounts.find(account_id)?.ok_or(RecurringError::NotFound)?;
    if account.archived {
        return Ok(0);
    }

    let mut generated = 0;
    for rule in rules.list_by_account(account_id)? {
        // A rule that has generated nothing yet is anchored at its own start
        // date rather than the account's stamp, whatever that stamp says.
        // Opening the account screen is what stamps it, and the rules modal
        // hangs off that same screen, so every rule is created against an
        // already-stamped account — anchoring on the stamp would make "start
        // date in the past" backfill nothing at all (user story 6).
        let window_start = match rules.last_generated_date(rule.id)? {
            Some(_) => account
                .last_viewed_date
                .clone()
                .unwrap_or_else(|| rule.schedule.start_date.clone()),
            None => rule.schedule.start_date.clone(),
        };
        let mut outstanding = rules.list_overrides(rule.id)?;

        for date in occurrences_between(&rule.schedule, &window_start, today) {
            let overridden = outstanding
                .iter()
                .position(|candidate| candidate.occurrence_date == date);
            let template = match overridden {
                Some(index) => outstanding[index].template.clone(),
                None => rule.template.clone(),
            };

            if !rules.insert_occurrence_if_absent(rule.id, account_id, &date, &template)? {
                continue;
            }
            generated += 1;
            if let Some(index) = overridden {
                rules.delete_override(rule.id, &date)?;
                outstanding.remove(index);
            }
        }

        // What is left is an override the loop never wrote an entry from. Once
        // its date has gone by it never will — the occurrence it was keyed to
        // is either already in the register or off the rule's schedule
        // entirely — so pruning it here stops it resurfacing months later, and
        // is what makes the non-atomic schedule-change path self-healing.
        for stale in outstanding
            .iter()
            .filter(|candidate| &candidate.occurrence_date <= today)
        {
            rules.delete_override(rule.id, &stale.occurrence_date)?;
        }
    }

    // Stamped even when nothing was generated: the account has genuinely been
    // brought up to today, and leaving it unstamped would make every later
    // run redo the same window.
    accounts.set_last_viewed_date(account_id, today)?;

    Ok(generated)
}

/// The startup sweep: brings every active account up to `today`, so the home
/// screen's balances are correct before the user looks at them. Archived
/// accounts are not listed, and would generate nothing if they were.
pub fn generate_due_for_all(
    accounts: &dyn AccountRepository,
    rules: &dyn RecurringRuleRepository,
    today: &IsoDate,
) -> Result<usize, RecurringError> {
    let mut generated = 0;
    for account in accounts.list(false)? {
        generated += generate_due_for_account(rules, accounts, account.id, today)?;
    }
    Ok(generated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::account::{Account, AccountDetails, AccountError};
    use std::cell::RefCell;

    /// One row the generator wrote into `entries`, with everything the
    /// occurrence carried — the template fields are what several tests read
    /// back to check they landed verbatim.
    #[derive(Debug, Clone, PartialEq, Eq)]
    struct GeneratedEntry {
        rule_id: i64,
        account_id: i64,
        date: IsoDate,
        template: RuleTemplate,
    }

    /// Stands in for both the rules table and the generated entries the
    /// rules point at — `generated` is only ever rewritten by the generator,
    /// never by a rule edit, which is exactly the invariant several tests
    /// assert.
    #[derive(Default)]
    struct FakeStore {
        rules: RefCell<Vec<RecurringRule>>,
        overrides: RefCell<Vec<OccurrenceOverride>>,
        generated: RefCell<Vec<GeneratedEntry>>,
        next_id: RefCell<i64>,
    }

    impl FakeStore {
        fn generated_occurrence(self, rule_id: i64, date: &str) -> Self {
            self.generated.borrow_mut().push(GeneratedEntry {
                rule_id,
                account_id: 1,
                date: IsoDate::parse(date).unwrap(),
                template: template("Loyer", -75_000),
            });
            self
        }

        fn generated_dates(&self) -> Vec<String> {
            self.generated
                .borrow()
                .iter()
                .map(|e| e.date.to_string())
                .collect()
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
                .filter(|e| e.rule_id == rule_id)
                .map(|e| e.date.clone())
                .max())
        }

        fn insert_occurrence_if_absent(
            &self,
            rule_id: i64,
            account_id: i64,
            date: &IsoDate,
            template: &RuleTemplate,
        ) -> Result<bool, RecurringError> {
            let mut generated = self.generated.borrow_mut();
            if generated
                .iter()
                .any(|e| e.rule_id == rule_id && &e.date == date)
            {
                return Ok(false);
            }
            generated.push(GeneratedEntry {
                rule_id,
                account_id,
                date: date.clone(),
                template: template.clone(),
            });
            Ok(true)
        }
    }

    /// The accounts half of the generator's world: `last_viewed_date` is both
    /// what opens the window and what the generator stamps, so it is the one
    /// field these tests actually exercise.
    #[derive(Default)]
    struct FakeAccounts {
        accounts: RefCell<Vec<Account>>,
    }

    impl FakeAccounts {
        fn with(id: i64, last_viewed: Option<&str>, archived: bool) -> Self {
            let accounts = FakeAccounts::default();
            accounts.add(id, last_viewed, archived);
            accounts
        }

        fn add(&self, id: i64, last_viewed: Option<&str>, archived: bool) {
            self.accounts.borrow_mut().push(Account {
                id,
                name: format!("Compte {id}"),
                color: "#3b82f6".to_owned(),
                icon: "wallet".to_owned(),
                created_date: IsoDate::parse("2026-01-01").unwrap(),
                opening_balance: 0,
                archived,
                last_viewed_date: last_viewed.map(|d| IsoDate::parse(d).unwrap()),
            });
        }

        fn last_viewed_date(&self, id: i64) -> Option<String> {
            self.accounts
                .borrow()
                .iter()
                .find(|a| a.id == id)
                .and_then(|a| a.last_viewed_date.as_ref().map(|d| d.to_string()))
        }
    }

    impl AccountRepository for FakeAccounts {
        fn create(&self, _details: &AccountDetails) -> Result<Account, AccountError> {
            unimplemented!("generation never creates an account")
        }

        fn update(&self, _id: i64, _details: &AccountDetails) -> Result<Account, AccountError> {
            unimplemented!("generation never edits an account")
        }

        fn set_archived(&self, _id: i64, _archived: bool) -> Result<Account, AccountError> {
            unimplemented!("generation never archives an account")
        }

        fn delete(&self, _id: i64) -> Result<(), AccountError> {
            unimplemented!("generation never deletes an account")
        }

        fn find(&self, id: i64) -> Result<Option<Account>, AccountError> {
            Ok(self.accounts.borrow().iter().find(|a| a.id == id).cloned())
        }

        fn list(&self, archived: bool) -> Result<Vec<Account>, AccountError> {
            Ok(self
                .accounts
                .borrow()
                .iter()
                .filter(|a| a.archived == archived)
                .cloned()
                .collect())
        }

        fn set_last_viewed_date(&self, id: i64, date: &IsoDate) -> Result<(), AccountError> {
            let mut accounts = self.accounts.borrow_mut();
            let account = accounts
                .iter_mut()
                .find(|a| a.id == id)
                .ok_or(AccountError::NotFound)?;
            account.last_viewed_date = Some(date.clone());
            Ok(())
        }
    }

    fn template(label: &str, cents: i64) -> RuleTemplate {
        RuleTemplate {
            label: label.to_owned(),
            category_id: None,
            amount: SignedCents::new(cents),
            description: String::new(),
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
        let store = store.generated_occurrence(created.id, "2026-03-01");

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

    /// A schedule change forces `AllFuture` for the whole edit, template
    /// fields included, when both change in the same save — the UI relies on
    /// this to decide whether asking about scope is even meaningful.
    #[test]
    fn a_combined_schedule_and_template_change_mutates_the_rule_whatever_scope_is_requested() {
        let store = FakeStore::default();
        let created = create_rule(&store, 1, input("Loyer", -750.0)).unwrap();

        update_rule(
            &store,
            created.id,
            RuleInput {
                frequency: Frequency::Yearly,
                ..input("Loyer", -800.0)
            },
            EditScope::NextOccurrenceOnly,
        )
        .unwrap();

        let stored = store.rules.borrow()[0].clone();
        assert_eq!(stored.schedule.frequency, Frequency::Yearly);
        assert_eq!(stored.template.amount.to_cents(), -80_000);
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

    fn date(value: &str) -> IsoDate {
        IsoDate::parse(value).unwrap()
    }

    #[test]
    fn generation_covers_the_window_from_the_last_viewed_date_to_today() {
        // Seeded as already having generated once, which is what puts the
        // rule on the cheap `last_viewed_date` window rather than the
        // start-date backfill the test above covers.
        let store = FakeStore::default().generated_occurrence(1, "2026-04-01");
        create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        let accounts = FakeAccounts::with(1, Some("2026-04-15"), false);

        let generated =
            generate_due_for_account(&store, &accounts, 1, &date("2026-06-01")).unwrap();

        assert_eq!(generated, 2);
        assert_eq!(
            store.generated_dates(),
            ["2026-04-01", "2026-05-01", "2026-06-01"]
        );
    }

    /// User story 6 on the only path the UI can actually produce. The rules
    /// modal is reachable solely from the account screen, and merely opening
    /// that screen stamps `last_viewed_date`, so a rule is *always* added to
    /// an already-stamped account. Anchoring a rule that has generated
    /// nothing at its own start date is what keeps "start date in the past"
    /// backfilling instead of silently generating nothing.
    #[test]
    fn a_never_generated_rule_backfills_from_its_start_date_on_a_stamped_account() {
        let store = FakeStore::default();
        create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        let accounts = FakeAccounts::with(1, Some("2026-05-20"), false);

        let generated =
            generate_due_for_account(&store, &accounts, 1, &date("2026-06-01")).unwrap();

        assert_eq!(generated, 4);
        assert_eq!(
            store.generated_dates(),
            ["2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"]
        );
    }

    /// User story 6: an account that has never been stamped opens its window
    /// at each rule's own start date, so a rule added for something that has
    /// been running for months brings the register up to date.
    #[test]
    fn an_unstamped_account_backfills_from_each_rules_start_date() {
        let store = FakeStore::default();
        create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        let accounts = FakeAccounts::with(1, None, false);

        let generated =
            generate_due_for_account(&store, &accounts, 1, &date("2026-06-01")).unwrap();

        assert_eq!(generated, 4);
        assert_eq!(
            store.generated_dates(),
            ["2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"]
        );
    }

    /// User story 11: the window's far end is inclusive, so today's rent
    /// appears today rather than tomorrow.
    #[test]
    fn an_occurrence_dated_exactly_today_is_generated() {
        let store = FakeStore::default();
        create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        let accounts = FakeAccounts::with(1, None, false);

        generate_due_for_account(&store, &accounts, 1, &date("2026-03-01")).unwrap();

        assert_eq!(store.generated_dates(), ["2026-03-01"]);
    }

    /// User story 14, asserted on the entry count rather than the absence of
    /// an error: the failure being guarded against is duplicated money.
    #[test]
    fn generating_twice_on_the_same_day_produces_no_second_entry() {
        let store = FakeStore::default();
        create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        let accounts = FakeAccounts::with(1, None, false);

        let first = generate_due_for_account(&store, &accounts, 1, &date("2026-05-01")).unwrap();
        let second = generate_due_for_account(&store, &accounts, 1, &date("2026-05-01")).unwrap();

        assert_eq!(first, 3);
        assert_eq!(second, 0);
        assert_eq!(store.generated.borrow().len(), 3);
    }

    #[test]
    fn a_generated_entry_carries_its_rule_and_the_templates_fields_verbatim() {
        let store = FakeStore::default();
        let created = create_rule(
            &store,
            7,
            RuleInput {
                category_id: Some(3),
                description: "studio".to_owned(),
                ..input("Loyer", -750.0)
            },
        )
        .unwrap();
        let accounts = FakeAccounts::with(7, None, false);

        generate_due_for_account(&store, &accounts, 7, &date("2026-03-01")).unwrap();

        let entry = store.generated.borrow()[0].clone();
        assert_eq!(entry.rule_id, created.id);
        assert_eq!(entry.account_id, 7);
        assert_eq!(entry.date.as_str(), "2026-03-01");
        assert_eq!(entry.template.label, "Loyer");
        assert_eq!(entry.template.category_id, Some(3));
        assert_eq!(entry.template.amount.to_cents(), -75_000);
        assert_eq!(entry.template.description, "studio");
    }

    #[test]
    fn generation_stamps_the_account_with_today() {
        let store = FakeStore::default();
        create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        let accounts = FakeAccounts::with(1, Some("2026-04-15"), false);

        generate_due_for_account(&store, &accounts, 1, &date("2026-06-01")).unwrap();

        assert_eq!(accounts.last_viewed_date(1).as_deref(), Some("2026-06-01"));
    }

    /// Leaving an account with no rules unstamped would make every later run
    /// redo the same window for it.
    #[test]
    fn an_account_with_no_rules_generates_nothing_and_is_still_stamped() {
        let store = FakeStore::default();
        let accounts = FakeAccounts::with(1, None, false);

        let generated =
            generate_due_for_account(&store, &accounts, 1, &date("2026-06-01")).unwrap();

        assert_eq!(generated, 0);
        assert_eq!(accounts.last_viewed_date(1).as_deref(), Some("2026-06-01"));
    }

    #[test]
    fn generating_for_an_unknown_account_reports_it_as_missing() {
        let store = FakeStore::default();
        let accounts = FakeAccounts::default();

        let err =
            generate_due_for_account(&store, &accounts, 404, &date("2026-06-01")).unwrap_err();

        assert_eq!(err, RecurringError::NotFound);
    }

    /// User story 25, on the path the sweep doesn't cover: an archived
    /// account is still reachable from the home screen's archived list, and
    /// opening it must neither generate nor consume its stale stamp — that
    /// stamp is what unarchiving backfills from.
    #[test]
    fn opening_an_archived_account_generates_nothing_and_leaves_its_stamp_alone() {
        let store = FakeStore::default();
        create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        let accounts = FakeAccounts::with(1, Some("2026-03-01"), true);

        let generated =
            generate_due_for_account(&store, &accounts, 1, &date("2026-06-01")).unwrap();

        assert_eq!(generated, 0);
        assert!(store.generated.borrow().is_empty());
        assert_eq!(accounts.last_viewed_date(1).as_deref(), Some("2026-03-01"));
    }

    /// User story 25: archiving an account genuinely stops it moving.
    #[test]
    fn the_sweep_covers_every_active_account_and_skips_archived_ones() {
        let store = FakeStore::default();
        create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        create_rule(&store, 2, input("Salaire", 2_100.0)).unwrap();
        create_rule(&store, 3, input("Assurance", -30.0)).unwrap();
        let accounts = FakeAccounts::default();
        accounts.add(1, None, false);
        accounts.add(2, None, false);
        accounts.add(3, None, true);

        let generated = generate_due_for_all(&accounts, &store, &date("2026-03-01")).unwrap();

        assert_eq!(generated, 2);
        assert_eq!(accounts.last_viewed_date(1).as_deref(), Some("2026-03-01"));
        assert_eq!(accounts.last_viewed_date(2).as_deref(), Some("2026-03-01"));
        assert_eq!(
            accounts.last_viewed_date(3),
            None,
            "an archived account is not swept, so it is not stamped either"
        );
    }

    /// User stories 19 and 20: the exception applies once, and the period
    /// after next goes back to the rule's own amount on its own.
    #[test]
    fn an_override_applies_to_its_one_occurrence_and_is_consumed() {
        let store = FakeStore::default();
        let created = create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        update_rule(
            &store,
            created.id,
            input("Loyer", -800.0),
            EditScope::NextOccurrenceOnly,
        )
        .unwrap();
        let accounts = FakeAccounts::with(1, None, false);

        generate_due_for_account(&store, &accounts, 1, &date("2026-04-01")).unwrap();

        let generated = store.generated.borrow();
        assert_eq!(generated[0].date.as_str(), "2026-03-01");
        assert_eq!(generated[0].template.amount.to_cents(), -80_000);
        assert_eq!(
            generated[1].template.amount.to_cents(),
            -75_000,
            "the occurrence after the override reverts to the rule's template"
        );
        assert!(
            store.list_overrides(created.id).unwrap().is_empty(),
            "the override is consumed once its occurrence is written"
        );
    }

    /// The self-healing half of the deliberately non-atomic schedule-change
    /// path: an override left keyed to a date the schedule no longer lands on
    /// can never resurface months later.
    #[test]
    fn an_override_whose_date_passed_unconsumed_is_pruned() {
        let store = FakeStore::default();
        let created = create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        store
            .save_override(&OccurrenceOverride {
                rule_id: created.id,
                occurrence_date: date("2026-03-15"),
                template: template("Loyer", -80_000),
            })
            .unwrap();
        let accounts = FakeAccounts::with(1, None, false);

        generate_due_for_account(&store, &accounts, 1, &date("2026-04-01")).unwrap();

        assert!(store.list_overrides(created.id).unwrap().is_empty());
        assert!(
            store
                .generated
                .borrow()
                .iter()
                .all(|e| e.template.amount.to_cents() == -75_000),
            "a pruned override never reaches an entry"
        );
    }

    #[test]
    fn an_override_dated_beyond_today_survives_until_its_occurrence_is_due() {
        let store = FakeStore::default();
        let created = create_rule(&store, 1, input("Loyer", -750.0)).unwrap();
        store
            .save_override(&OccurrenceOverride {
                rule_id: created.id,
                occurrence_date: date("2026-06-01"),
                template: template("Loyer", -80_000),
            })
            .unwrap();
        let accounts = FakeAccounts::with(1, None, false);

        generate_due_for_account(&store, &accounts, 1, &date("2026-04-01")).unwrap();

        assert_eq!(store.list_overrides(created.id).unwrap().len(), 1);
    }
}
