//! Reconciliation orchestration: reads the two stored settings, asks the
//! entry aggregate for the reconciled balance, and applies
//! `domain::reconciliation`'s pure arithmetic to the pair.
//!
//! The bank balance arrives here as the raw major-unit `f64` the user typed
//! and is converted to cents *here*, before touching the domain or storage,
//! exactly as the opening-balance field does (technical-architecture.md
//! §1.3). Everything downstream of this module is integer cents.

use crate::domain::date::IsoDate;
use crate::domain::entry::EntryRepository;
use crate::domain::money;
use crate::domain::reconciliation::{
    self, ReconciliationError, ReconciliationRepository, ReconciliationSummary,
};

/// Everything the panel needs, in one read. A `None` statement date stops
/// the reconciled balance being computed at all rather than defaulting to
/// something the app would have had to guess at, and a missing balance on
/// either side leaves the delta absent rather than zero.
pub fn reconciliation_summary(
    settings_repo: &dyn ReconciliationRepository,
    entries: &dyn EntryRepository,
    account_id: i64,
) -> Result<ReconciliationSummary, ReconciliationError> {
    let settings = settings_repo
        .find_settings(account_id)?
        .ok_or(ReconciliationError::UnknownAccount)?;

    let reconciled_balance = settings
        .statement_date
        .as_ref()
        .map(|date| entries.sum_reconciled_up_to(account_id, date))
        .transpose()?;

    let delta = settings
        .bank_balance
        .zip(reconciled_balance)
        .map(|(bank, reconciled)| reconciliation::delta(bank, reconciled));

    Ok(ReconciliationSummary {
        statement_date: settings.statement_date,
        bank_balance: settings.bank_balance,
        reconciled_balance,
        delta,
        is_balanced: delta.is_some_and(reconciliation::is_balanced),
        unreconciled_count: entries.count_unreconciled_by_account(account_id)?,
    })
}

/// `amount` is the raw major-unit value as typed — never pre-scaled by the
/// frontend, which would duplicate the rounding decision at a second,
/// unsynchronized site.
pub fn set_bank_balance(
    settings_repo: &dyn ReconciliationRepository,
    entries: &dyn EntryRepository,
    account_id: i64,
    amount: f64,
) -> Result<ReconciliationSummary, ReconciliationError> {
    settings_repo.set_bank_balance(account_id, money::to_cents(amount)?)?;
    reconciliation_summary(settings_repo, entries, account_id)
}

pub fn set_statement_date(
    settings_repo: &dyn ReconciliationRepository,
    entries: &dyn EntryRepository,
    account_id: i64,
    date: &str,
) -> Result<ReconciliationSummary, ReconciliationError> {
    settings_repo.set_statement_date(account_id, &IsoDate::parse(date)?)?;
    reconciliation_summary(settings_repo, entries, account_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    use crate::domain::entry::{
        Entry, EntryDetails, EntryError, EntryListQuery, EntryPage, SortDirection,
    };
    use crate::domain::reconciliation::ReconciliationSettings;

    #[derive(Default)]
    struct FakeSettings {
        by_account: RefCell<HashMap<i64, ReconciliationSettings>>,
    }

    impl FakeSettings {
        /// An account that exists but has told us nothing yet — the state
        /// every account predating the migration is in.
        fn with_account(self, account_id: i64) -> Self {
            self.by_account
                .borrow_mut()
                .insert(account_id, ReconciliationSettings::default());
            self
        }

        fn with_bank_balance(self, account_id: i64, cents: i64) -> Self {
            self.by_account
                .borrow_mut()
                .entry(account_id)
                .or_default()
                .bank_balance = Some(cents);
            self
        }

        fn with_statement_date(self, account_id: i64, date: &str) -> Self {
            self.by_account
                .borrow_mut()
                .entry(account_id)
                .or_default()
                .statement_date = Some(IsoDate::parse(date).unwrap());
            self
        }

        fn stored(&self, account_id: i64) -> ReconciliationSettings {
            self.by_account.borrow().get(&account_id).cloned().unwrap()
        }
    }

    impl ReconciliationRepository for FakeSettings {
        fn find_settings(
            &self,
            account_id: i64,
        ) -> Result<Option<ReconciliationSettings>, ReconciliationError> {
            Ok(self.by_account.borrow().get(&account_id).cloned())
        }

        fn set_bank_balance(
            &self,
            account_id: i64,
            bank_balance: i64,
        ) -> Result<(), ReconciliationError> {
            match self.by_account.borrow_mut().get_mut(&account_id) {
                Some(settings) => {
                    settings.bank_balance = Some(bank_balance);
                    Ok(())
                }
                None => Err(ReconciliationError::UnknownAccount),
            }
        }

        fn set_statement_date(
            &self,
            account_id: i64,
            statement_date: &IsoDate,
        ) -> Result<(), ReconciliationError> {
            match self.by_account.borrow_mut().get_mut(&account_id) {
                Some(settings) => {
                    settings.statement_date = Some(statement_date.clone());
                    Ok(())
                }
                None => Err(ReconciliationError::UnknownAccount),
            }
        }
    }

    /// A plain list of (date, cents, reconciled, is_system) rows, summed the
    /// same way the SQL aggregate does — the cut-off and the tick rule, with
    /// no database.
    #[derive(Default)]
    struct FakeEntries {
        rows: Vec<(IsoDate, i64, bool, bool)>,
    }

    impl FakeEntries {
        fn opening(mut self, date: &str, cents: i64) -> Self {
            self.rows
                .push((IsoDate::parse(date).unwrap(), cents, false, true));
            self
        }

        fn reconciled(mut self, date: &str, cents: i64) -> Self {
            self.rows
                .push((IsoDate::parse(date).unwrap(), cents, true, false));
            self
        }

        fn unreconciled(mut self, date: &str, cents: i64) -> Self {
            self.rows
                .push((IsoDate::parse(date).unwrap(), cents, false, false));
            self
        }
    }

    impl EntryRepository for FakeEntries {
        fn sum_reconciled_up_to(
            &self,
            _account_id: i64,
            statement_date: &IsoDate,
        ) -> Result<i64, EntryError> {
            Ok(self
                .rows
                .iter()
                .filter(|(date, _, reconciled, is_system)| {
                    (*reconciled || *is_system) && date <= statement_date
                })
                .map(|(_, cents, _, _)| cents)
                .sum())
        }

        fn count_unreconciled_by_account(&self, _account_id: i64) -> Result<i64, EntryError> {
            Ok(self
                .rows
                .iter()
                .filter(|(_, _, reconciled, is_system)| !*reconciled && !*is_system)
                .count() as i64)
        }

        fn sum_by_account(&self, _account_id: i64) -> Result<i64, EntryError> {
            unimplemented!("reconciliation doesn't read the current balance")
        }

        fn last_entry_date(&self, _account_id: i64) -> Result<Option<IsoDate>, EntryError> {
            unimplemented!("reconciliation doesn't read last-activity dates")
        }

        fn exists_non_system_on_or_before(
            &self,
            _account_id: i64,
            _date: &IsoDate,
        ) -> Result<bool, EntryError> {
            unimplemented!("reconciliation doesn't guard opening dates")
        }

        fn count_non_system_by_account(&self, _account_id: i64) -> Result<i64, EntryError> {
            unimplemented!("reconciliation doesn't count entries per account")
        }

        fn count_by_category(&self, _category_id: i64) -> Result<i64, EntryError> {
            unimplemented!("reconciliation doesn't count entries per category")
        }

        fn list_by_account(
            &self,
            _account_id: i64,
            _query: &EntryListQuery,
        ) -> Result<EntryPage, EntryError> {
            unimplemented!("reconciliation doesn't list entries")
        }

        fn offset_for_date(
            &self,
            _account_id: i64,
            _from: Option<&IsoDate>,
            _to: Option<&IsoDate>,
            _unreconciled_only: bool,
            _sort: SortDirection,
            _target: &IsoDate,
        ) -> Result<i64, EntryError> {
            unimplemented!("reconciliation doesn't jump to a date")
        }

        fn find(&self, _id: i64) -> Result<Option<Entry>, EntryError> {
            unimplemented!("reconciliation doesn't read single entries")
        }

        fn create(&self, _account_id: i64, _details: &EntryDetails) -> Result<Entry, EntryError> {
            unimplemented!("reconciliation doesn't write entries")
        }

        fn update(&self, _id: i64, _details: &EntryDetails) -> Result<Entry, EntryError> {
            unimplemented!("reconciliation doesn't write entries")
        }

        fn delete(&self, _id: i64) -> Result<(), EntryError> {
            unimplemented!("reconciliation doesn't write entries")
        }

        fn set_reconciled(&self, _id: i64, _reconciled: bool) -> Result<Entry, EntryError> {
            unimplemented!("reconciliation doesn't tick entries")
        }
    }

    /// Opening 100_000, one ticked debit of 2_550 and one ticked credit of
    /// 1_000 inside the statement period: a reconciled balance of 98_450.
    fn reconciled_account() -> FakeEntries {
        FakeEntries::default()
            .opening("2026-01-15", 100_000)
            .reconciled("2026-02-01", -2_550)
            .reconciled("2026-02-02", 1_000)
    }

    #[test]
    fn a_fully_reconciled_account_reports_balanced() {
        let settings = FakeSettings::default()
            .with_statement_date(1, "2026-02-28")
            .with_bank_balance(1, 98_450);

        let summary = reconciliation_summary(&settings, &reconciled_account(), 1).unwrap();

        assert_eq!(summary.reconciled_balance, Some(98_450));
        assert_eq!(summary.bank_balance, Some(98_450));
        assert_eq!(summary.delta, Some(0));
        assert!(summary.is_balanced);
    }

    #[test]
    fn a_bank_holding_more_than_the_register_reports_a_positive_delta() {
        let settings = FakeSettings::default()
            .with_statement_date(1, "2026-02-28")
            .with_bank_balance(1, 100_000);

        let summary = reconciliation_summary(&settings, &reconciled_account(), 1).unwrap();

        assert_eq!(summary.delta, Some(1_550));
        assert!(!summary.is_balanced);
    }

    #[test]
    fn a_bank_holding_less_than_the_register_reports_a_negative_delta() {
        let settings = FakeSettings::default()
            .with_statement_date(1, "2026-02-28")
            .with_bank_balance(1, 96_900);

        let summary = reconciliation_summary(&settings, &reconciled_account(), 1).unwrap();

        assert_eq!(summary.delta, Some(-1_550));
        assert!(!summary.is_balanced);
    }

    #[test]
    fn the_reconciled_balance_nets_mixed_debits_and_credits() {
        let entries = FakeEntries::default()
            .opening("2026-01-15", 100_000)
            .reconciled("2026-02-01", -2_550)
            .reconciled("2026-02-02", 1_000)
            .reconciled("2026-02-03", -750)
            .reconciled("2026-02-04", 33_333)
            .reconciled("2026-02-05", -1);
        let settings = FakeSettings::default()
            .with_statement_date(1, "2026-02-28")
            .with_bank_balance(1, 131_032);

        let summary = reconciliation_summary(&settings, &entries, 1).unwrap();

        // Summing magnitudes would give 137_634, not 131_032.
        assert_eq!(summary.reconciled_balance, Some(131_032));
        assert_eq!(summary.delta, Some(0));
        assert!(summary.is_balanced);
    }

    #[test]
    fn unticked_entries_and_entries_past_the_statement_date_stay_out_of_the_balance() {
        let entries = reconciled_account()
            .unreconciled("2026-02-10", -50_000)
            .reconciled("2026-03-01", -40_000);
        let settings = FakeSettings::default()
            .with_statement_date(1, "2026-02-28")
            .with_bank_balance(1, 98_450);

        let summary = reconciliation_summary(&settings, &entries, 1).unwrap();

        assert_eq!(summary.reconciled_balance, Some(98_450));
        assert!(summary.is_balanced);
    }

    #[test]
    fn no_statement_date_yields_no_reconciled_balance_and_no_delta() {
        let settings = FakeSettings::default().with_bank_balance(1, 98_450);

        let summary = reconciliation_summary(&settings, &reconciled_account(), 1).unwrap();

        assert_eq!(summary.statement_date, None);
        assert_eq!(summary.reconciled_balance, None);
        assert_eq!(summary.delta, None);
        assert!(!summary.is_balanced);
        assert_eq!(summary.bank_balance, Some(98_450));
    }

    #[test]
    fn no_bank_balance_yields_a_reconciled_balance_but_no_delta() {
        let settings = FakeSettings::default().with_statement_date(1, "2026-02-28");

        let summary = reconciliation_summary(&settings, &reconciled_account(), 1).unwrap();

        assert_eq!(summary.reconciled_balance, Some(98_450));
        assert_eq!(summary.bank_balance, None);
        assert_eq!(summary.delta, None);
        assert!(!summary.is_balanced);
    }

    #[test]
    fn an_account_with_neither_value_set_still_reports_its_unreconciled_count() {
        let settings = FakeSettings::default().with_account(1);
        let entries = reconciled_account().unreconciled("2026-02-10", -50_000);

        let summary = reconciliation_summary(&settings, &entries, 1).unwrap();

        assert_eq!(summary.reconciled_balance, None);
        assert_eq!(summary.delta, None);
        assert_eq!(summary.unreconciled_count, 1);
    }

    #[test]
    fn the_unreconciled_count_is_carried_through() {
        let settings = FakeSettings::default()
            .with_statement_date(1, "2026-02-28")
            .with_bank_balance(1, 98_450);
        let entries = reconciled_account()
            .unreconciled("2026-02-10", -50_000)
            .unreconciled("2026-02-11", -60_000);

        let summary = reconciliation_summary(&settings, &entries, 1).unwrap();

        assert_eq!(summary.unreconciled_count, 2);
    }

    #[test]
    fn the_summary_of_an_unknown_account_is_refused() {
        let settings = FakeSettings::default().with_account(1);

        let err = reconciliation_summary(&settings, &reconciled_account(), 404).unwrap_err();

        assert_eq!(err, ReconciliationError::UnknownAccount);
    }

    #[test]
    fn setting_the_bank_balance_converts_the_typed_amount_to_cents() {
        let settings = FakeSettings::default()
            .with_account(1)
            .with_statement_date(1, "2026-02-28");

        let summary = set_bank_balance(&settings, &reconciled_account(), 1, 984.50).unwrap();

        assert_eq!(settings.stored(1).bank_balance, Some(98_450));
        assert_eq!(summary.bank_balance, Some(98_450));
        assert_eq!(summary.delta, Some(0));
        assert!(summary.is_balanced);
    }

    #[test]
    fn setting_the_bank_balance_keeps_every_cent_of_a_two_decimal_amount() {
        let settings = FakeSettings::default().with_account(1);

        // 1234.56 scales to 123455.99999999999 in binary floating point;
        // truncating instead of rounding would store a cent less. 0.07 and
        // 8.20 are the other classic representation traps.
        for (typed, expected) in [
            (1234.56_f64, 123_456),
            (0.07, 7),
            (8.20, 820),
            (-42.10, -4_210),
            (4_999.99, 499_999),
            (0.0, 0),
            (-0.01, -1),
        ] {
            set_bank_balance(&settings, &reconciled_account(), 1, typed).unwrap();
            assert_eq!(
                settings.stored(1).bank_balance,
                Some(expected),
                "{typed} should store as {expected} cents"
            );
        }
    }

    #[test]
    fn setting_the_bank_balance_rejects_an_amount_finer_than_a_cent() {
        let settings = FakeSettings::default().with_account(1);

        let err = set_bank_balance(&settings, &reconciled_account(), 1, 1234.567).unwrap_err();

        assert!(matches!(err, ReconciliationError::InvalidAmount(_)));
        assert_eq!(settings.stored(1).bank_balance, None);
    }

    #[test]
    fn setting_the_bank_balance_rejects_a_non_numeric_amount() {
        let settings = FakeSettings::default().with_account(1);

        for value in [f64::NAN, f64::INFINITY, f64::MAX] {
            let err = set_bank_balance(&settings, &reconciled_account(), 1, value).unwrap_err();
            assert!(matches!(err, ReconciliationError::InvalidAmount(_)));
        }
        assert_eq!(settings.stored(1).bank_balance, None);
    }

    #[test]
    fn setting_the_bank_balance_on_an_unknown_account_is_refused() {
        let settings = FakeSettings::default().with_account(1);

        let err = set_bank_balance(&settings, &reconciled_account(), 404, 10.0).unwrap_err();

        assert_eq!(err, ReconciliationError::UnknownAccount);
    }

    #[test]
    fn setting_the_statement_date_stores_it_and_recomputes_the_balance() {
        let settings = FakeSettings::default()
            .with_account(1)
            .with_bank_balance(1, 98_450);

        let summary =
            set_statement_date(&settings, &reconciled_account(), 1, "2026-02-28").unwrap();

        assert_eq!(
            settings.stored(1).statement_date.map(|d| d.to_string()),
            Some("2026-02-28".to_owned())
        );
        assert_eq!(
            summary.statement_date.map(|d| d.to_string()),
            Some("2026-02-28".to_owned())
        );
        assert_eq!(summary.reconciled_balance, Some(98_450));
        assert!(summary.is_balanced);
    }

    #[test]
    fn moving_the_statement_date_back_shrinks_the_reconciled_balance() {
        let settings = FakeSettings::default()
            .with_account(1)
            .with_bank_balance(1, 98_450);

        let summary =
            set_statement_date(&settings, &reconciled_account(), 1, "2026-02-01").unwrap();

        // Only the opening balance and the 2_550 debit are in scope now.
        assert_eq!(summary.reconciled_balance, Some(97_450));
        assert_eq!(summary.delta, Some(1_000));
        assert!(!summary.is_balanced);
    }

    #[test]
    fn setting_a_malformed_statement_date_is_refused() {
        let settings = FakeSettings::default().with_account(1);

        for value in ["", "28/02/2026", "2026-2-28", "2026-02-30", "2026-13-01"] {
            let err = set_statement_date(&settings, &reconciled_account(), 1, value).unwrap_err();
            assert!(
                matches!(err, ReconciliationError::InvalidDate(_)),
                "expected {value} to be rejected"
            );
        }
        assert_eq!(settings.stored(1).statement_date, None);
    }

    #[test]
    fn setting_the_statement_date_on_an_unknown_account_is_refused() {
        let settings = FakeSettings::default().with_account(1);

        let err =
            set_statement_date(&settings, &reconciled_account(), 404, "2026-02-28").unwrap_err();

        assert_eq!(err, ReconciliationError::UnknownAccount);
    }

    #[test]
    fn the_summary_never_leaves_integer_cents() {
        // A balance beyond `f64`'s exact-integer range for cents would be
        // rounded if any step of the sum path went through a float; in
        // `i64` it survives untouched.
        let huge = 9_007_199_254_740_993_i64;
        let entries = FakeEntries::default().opening("2026-01-15", huge);
        let settings = FakeSettings::default()
            .with_statement_date(1, "2026-02-28")
            .with_bank_balance(1, huge - 1);

        let summary = reconciliation_summary(&settings, &entries, 1).unwrap();

        assert_eq!(summary.reconciled_balance, Some(huge));
        assert_eq!(summary.delta, Some(-1));
        assert!(!summary.is_balanced);
    }

    #[test]
    fn a_balanced_pair_of_negative_balances_is_still_balanced() {
        let entries = FakeEntries::default()
            .opening("2026-01-15", 10_000)
            .reconciled("2026-02-01", -50_000);
        let settings = FakeSettings::default()
            .with_statement_date(1, "2026-02-28")
            .with_bank_balance(1, -40_000);

        let summary = reconciliation_summary(&settings, &entries, 1).unwrap();

        assert_eq!(summary.reconciled_balance, Some(-40_000));
        assert_eq!(summary.delta, Some(0));
        assert!(summary.is_balanced);
    }

    #[test]
    fn a_statement_date_before_the_account_opened_reconciles_against_nothing() {
        let settings = FakeSettings::default()
            .with_account(1)
            .with_bank_balance(1, 0);

        let summary =
            set_statement_date(&settings, &reconciled_account(), 1, "2026-01-14").unwrap();

        assert_eq!(summary.reconciled_balance, Some(0));
        assert_eq!(summary.delta, Some(0));
        assert!(summary.is_balanced);
    }
}
