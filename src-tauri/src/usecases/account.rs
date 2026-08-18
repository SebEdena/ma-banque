//! Account business rules: the name/amount/opening-date validations, and
//! the deletion guard that makes losing real history impossible.
//!
//! Amounts arrive here as the major-unit `f64` the user typed and are
//! converted to cents *here*, before touching the domain or storage, so the
//! rounding decision has exactly one home (technical-architecture.md §1.3).

use crate::domain::account::{Account, AccountDetails, AccountError, AccountRepository};
use crate::domain::date::IsoDate;
use crate::domain::entry::EntryRepository;
use crate::domain::money;

/// An account plus the two values derived from its entries that every
/// account-listing surface shows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountSummary {
    pub account: Account,
    /// Cents.
    pub balance: i64,
    pub last_entry_date: Option<IsoDate>,
}

/// Create/edit form input, exactly as it comes off the settings modal.
#[derive(Debug, Clone, PartialEq)]
pub struct AccountInput {
    pub name: String,
    pub color: String,
    pub icon: String,
    pub created_date: IsoDate,
    /// Major units, as typed.
    pub opening_balance: f64,
}

impl AccountInput {
    fn validate(self) -> Result<AccountDetails, AccountError> {
        let name = self.name.trim();
        if name.is_empty() {
            return Err(AccountError::EmptyName);
        }

        Ok(AccountDetails {
            name: name.to_owned(),
            color: self.color,
            icon: self.icon,
            created_date: self.created_date,
            opening_balance: money::to_cents(self.opening_balance)?,
        })
    }
}

pub fn create_account(
    accounts: &dyn AccountRepository,
    entries: &dyn EntryRepository,
    input: AccountInput,
) -> Result<AccountSummary, AccountError> {
    let account = accounts.create(&input.validate()?)?;
    summarize(entries, account)
}

pub fn update_account(
    accounts: &dyn AccountRepository,
    entries: &dyn EntryRepository,
    id: i64,
    input: AccountInput,
) -> Result<AccountSummary, AccountError> {
    let details = input.validate()?;
    let current = accounts.find(id)?.ok_or(AccountError::NotFound)?;

    // The system entry moves with the opening date, so a new opening date at
    // or after a real entry would put the register out of chronological order.
    // Only a *change* is guarded: an account whose first entry already shares
    // its opening date is otherwise still editable (renaming it, say) rather
    // than frozen by a rule its date isn't breaking any further.
    if details.created_date != current.created_date
        && entries.exists_non_system_on_or_before(id, &details.created_date)?
    {
        return Err(AccountError::OpeningDateNotBeforeFirstEntry);
    }

    let account = accounts.update(id, &details)?;
    summarize(entries, account)
}

pub fn archive_account(accounts: &dyn AccountRepository, id: i64) -> Result<Account, AccountError> {
    accounts.set_archived(id, true)
}

pub fn unarchive_account(
    accounts: &dyn AccountRepository,
    id: i64,
) -> Result<Account, AccountError> {
    accounts.set_archived(id, false)
}

/// Deleting is only ever allowed for an account whose register holds nothing
/// but its opening balance — every account always carries that system entry,
/// so guarding on "has any entries" would make deletion unreachable.
pub fn delete_account(
    accounts: &dyn AccountRepository,
    entries: &dyn EntryRepository,
    id: i64,
) -> Result<(), AccountError> {
    if accounts.find(id)?.is_none() {
        return Err(AccountError::NotFound);
    }

    if entries.count_non_system_by_account(id)? > 0 {
        return Err(AccountError::HasNonSystemEntries);
    }

    accounts.delete(id)
}

pub fn list_active_accounts(
    accounts: &dyn AccountRepository,
    entries: &dyn EntryRepository,
) -> Result<Vec<AccountSummary>, AccountError> {
    list(accounts, entries, false)
}

pub fn list_archived_accounts(
    accounts: &dyn AccountRepository,
    entries: &dyn EntryRepository,
) -> Result<Vec<AccountSummary>, AccountError> {
    list(accounts, entries, true)
}

fn list(
    accounts: &dyn AccountRepository,
    entries: &dyn EntryRepository,
    archived: bool,
) -> Result<Vec<AccountSummary>, AccountError> {
    accounts
        .list(archived)?
        .into_iter()
        .map(|account| summarize(entries, account))
        .collect()
}

fn summarize(
    entries: &dyn EntryRepository,
    account: Account,
) -> Result<AccountSummary, AccountError> {
    Ok(AccountSummary {
        balance: entries.sum_by_account(account.id)?,
        last_entry_date: entries.last_entry_date(account.id)?,
        account,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::entry::{EntryError, SignedCents, SystemEntry};
    use std::cell::RefCell;

    /// In-memory `accounts` + `entries` pair, sharing one store so the
    /// create/update/delete methods keep an account and its system entry in
    /// step the way the SQLite implementation's transactions do.
    #[derive(Default)]
    struct FakeStore {
        accounts: RefCell<Vec<Account>>,
        entries: RefCell<Vec<FakeEntry>>,
        next_id: RefCell<i64>,
    }

    struct FakeEntry {
        account_id: i64,
        date: IsoDate,
        amount: SignedCents,
        is_system: bool,
    }

    impl FakeStore {
        fn take_id(&self) -> i64 {
            let mut next = self.next_id.borrow_mut();
            *next += 1;
            *next
        }

        fn add_real_entry(&self, account_id: i64, date: &str, cents: i64) {
            self.entries.borrow_mut().push(FakeEntry {
                account_id,
                date: IsoDate::parse(date).unwrap(),
                amount: SignedCents::new(cents),
                is_system: false,
            });
        }

        fn set_system_entry(&self, account_id: i64, entry: SystemEntry) {
            let mut entries = self.entries.borrow_mut();
            entries.retain(|e| !(e.account_id == account_id && e.is_system));
            entries.push(FakeEntry {
                account_id,
                date: entry.date,
                amount: entry.amount,
                is_system: true,
            });
        }

        fn system_entry_of(&self, account_id: i64) -> (String, i64) {
            let entries = self.entries.borrow();
            let entry = entries
                .iter()
                .find(|e| e.account_id == account_id && e.is_system)
                .expect("every account has a system entry");
            (entry.date.to_string(), entry.amount.to_cents())
        }
    }

    impl AccountRepository for FakeStore {
        fn create(&self, details: &AccountDetails) -> Result<Account, AccountError> {
            let account = Account {
                id: self.take_id(),
                name: details.name.clone(),
                color: details.color.clone(),
                icon: details.icon.clone(),
                created_date: details.created_date.clone(),
                opening_balance: details.opening_balance,
                archived: false,
                last_viewed_date: None,
            };
            self.set_system_entry(account.id, details.system_entry());
            self.accounts.borrow_mut().push(account.clone());
            Ok(account)
        }

        fn update(&self, id: i64, details: &AccountDetails) -> Result<Account, AccountError> {
            let mut accounts = self.accounts.borrow_mut();
            let account = accounts
                .iter_mut()
                .find(|a| a.id == id)
                .ok_or(AccountError::NotFound)?;

            account.name = details.name.clone();
            account.color = details.color.clone();
            account.icon = details.icon.clone();
            account.created_date = details.created_date.clone();
            account.opening_balance = details.opening_balance;

            self.set_system_entry(id, details.system_entry());
            Ok(account.clone())
        }

        fn set_archived(&self, id: i64, archived: bool) -> Result<Account, AccountError> {
            let mut accounts = self.accounts.borrow_mut();
            let account = accounts
                .iter_mut()
                .find(|a| a.id == id)
                .ok_or(AccountError::NotFound)?;
            account.archived = archived;
            Ok(account.clone())
        }

        fn delete(&self, id: i64) -> Result<(), AccountError> {
            self.entries.borrow_mut().retain(|e| e.account_id != id);
            self.accounts.borrow_mut().retain(|a| a.id != id);
            Ok(())
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

    impl EntryRepository for FakeStore {
        fn sum_by_account(&self, account_id: i64) -> Result<i64, EntryError> {
            Ok(self
                .entries
                .borrow()
                .iter()
                .filter(|e| e.account_id == account_id)
                .map(|e| e.amount.to_cents())
                .sum())
        }

        fn last_entry_date(&self, account_id: i64) -> Result<Option<IsoDate>, EntryError> {
            Ok(self
                .entries
                .borrow()
                .iter()
                .filter(|e| e.account_id == account_id)
                .map(|e| e.date.clone())
                .max())
        }

        fn exists_non_system_on_or_before(
            &self,
            account_id: i64,
            date: &IsoDate,
        ) -> Result<bool, EntryError> {
            Ok(self
                .entries
                .borrow()
                .iter()
                .any(|e| e.account_id == account_id && !e.is_system && &e.date <= date))
        }

        fn sum_reconciled_up_to(
            &self,
            _account_id: i64,
            _statement_date: &IsoDate,
        ) -> Result<i64, EntryError> {
            unimplemented!("account rules don't sum reconciled balances")
        }

        fn count_unreconciled_by_account(&self, _account_id: i64) -> Result<i64, EntryError> {
            unimplemented!("account rules don't count unreconciled entries")
        }

        fn count_non_system_by_account(&self, account_id: i64) -> Result<i64, EntryError> {
            Ok(self
                .entries
                .borrow()
                .iter()
                .filter(|e| e.account_id == account_id && !e.is_system)
                .count() as i64)
        }

        /// Nothing in this fake tags an entry with a category — the account
        /// rules don't involve them. `usecases::category`'s own fake covers
        /// this method's behavior.
        fn count_by_category(&self, _category_id: i64) -> Result<i64, EntryError> {
            Ok(0)
        }

        fn list_by_account(
            &self,
            _account_id: i64,
            _query: &crate::domain::entry::EntryListQuery,
        ) -> Result<crate::domain::entry::EntryPage, EntryError> {
            unimplemented!("account rules don't list entries")
        }

        fn offset_for_date(
            &self,
            _account_id: i64,
            _from: Option<&IsoDate>,
            _to: Option<&IsoDate>,
            _unreconciled_only: bool,
            _sort: crate::domain::entry::SortDirection,
            _target: &IsoDate,
        ) -> Result<i64, EntryError> {
            unimplemented!("account rules don't jump to a date")
        }

        fn find(&self, _id: i64) -> Result<Option<crate::domain::entry::Entry>, EntryError> {
            unimplemented!("account rules don't look up individual entries")
        }

        fn create(
            &self,
            _account_id: i64,
            _details: &crate::domain::entry::EntryDetails,
        ) -> Result<crate::domain::entry::Entry, EntryError> {
            unimplemented!("account rules don't create entries")
        }

        fn update(
            &self,
            _id: i64,
            _details: &crate::domain::entry::EntryDetails,
        ) -> Result<crate::domain::entry::Entry, EntryError> {
            unimplemented!("account rules don't update entries")
        }

        fn delete(&self, _id: i64) -> Result<(), EntryError> {
            unimplemented!("account rules don't delete entries")
        }

        fn set_reconciled(
            &self,
            _id: i64,
            _reconciled: bool,
        ) -> Result<crate::domain::entry::Entry, EntryError> {
            unimplemented!("account rules don't reconcile entries")
        }

        fn category_breakdown_aggregate(
            &self,
            _account_id: i64,
            _from: &crate::domain::date::IsoDate,
            _to: &crate::domain::date::IsoDate,
            _kind: crate::domain::entry::EntryKind,
        ) -> Result<crate::domain::statistics::CategoryBreakdownResponse, EntryError> {
            unimplemented!("account rules don't compute statistics")
        }

        fn month_bucketed_aggregate(
            &self,
            _account_id: i64,
            _from: &crate::domain::date::IsoDate,
            _to: &crate::domain::date::IsoDate,
        ) -> Result<crate::domain::statistics::MonthBucketedResponse, EntryError> {
            unimplemented!("account rules don't compute statistics")
        }
    }

    fn input(opening_balance: f64) -> AccountInput {
        AccountInput {
            name: "Compte courant".to_owned(),
            color: "#3b82f6".to_owned(),
            icon: "wallet".to_owned(),
            created_date: IsoDate::parse("2026-01-15").unwrap(),
            opening_balance,
        }
    }

    #[test]
    fn creating_an_account_writes_its_opening_balance_system_entry() {
        let store = FakeStore::default();

        let created = create_account(&store, &store, input(1_234.56)).unwrap();

        assert_eq!(created.account.opening_balance, 123_456);
        assert_eq!(created.balance, 123_456);
        assert_eq!(
            store.system_entry_of(created.account.id),
            ("2026-01-15".to_owned(), 123_456)
        );
    }

    #[test]
    fn a_new_accounts_last_entry_date_is_its_opening_date() {
        let store = FakeStore::default();

        let created = create_account(&store, &store, input(10.0)).unwrap();

        assert_eq!(
            created.last_entry_date.map(|d| d.to_string()),
            Some("2026-01-15".to_owned())
        );
    }

    #[test]
    fn creating_an_account_rejects_a_blank_name() {
        let store = FakeStore::default();

        let err = create_account(
            &store,
            &store,
            AccountInput {
                name: "   ".to_owned(),
                ..input(10.0)
            },
        )
        .unwrap_err();

        assert_eq!(err, AccountError::EmptyName);
        assert!(store.accounts.borrow().is_empty());
    }

    #[test]
    fn creating_an_account_trims_its_name() {
        let store = FakeStore::default();

        let created = create_account(
            &store,
            &store,
            AccountInput {
                name: "  Livret A  ".to_owned(),
                ..input(10.0)
            },
        )
        .unwrap();

        assert_eq!(created.account.name, "Livret A");
    }

    #[test]
    fn creating_an_account_rejects_an_amount_finer_than_a_cent() {
        let store = FakeStore::default();

        let err = create_account(&store, &store, input(12.345)).unwrap_err();

        assert!(matches!(err, AccountError::InvalidAmount(_)));
    }

    #[test]
    fn the_balance_is_the_signed_sum_of_every_entry() {
        let store = FakeStore::default();
        let created = create_account(&store, &store, input(1_000.0)).unwrap();
        store.add_real_entry(created.account.id, "2026-02-01", -25_50);
        store.add_real_entry(created.account.id, "2026-02-03", 10_00);

        let listed = list_active_accounts(&store, &store).unwrap();

        assert_eq!(listed[0].balance, 100_000 - 2_550 + 1_000);
    }

    #[test]
    fn updating_an_account_moves_its_system_entry_date_and_amount() {
        let store = FakeStore::default();
        let created = create_account(&store, &store, input(1_000.0)).unwrap();

        let updated = update_account(
            &store,
            &store,
            created.account.id,
            AccountInput {
                name: "Compte joint".to_owned(),
                created_date: IsoDate::parse("2026-01-01").unwrap(),
                opening_balance: -50.0,
                ..input(0.0)
            },
        )
        .unwrap();

        assert_eq!(updated.account.name, "Compte joint");
        assert_eq!(updated.balance, -5_000);
        assert_eq!(
            store.system_entry_of(created.account.id),
            ("2026-01-01".to_owned(), -5_000)
        );
    }

    #[test]
    fn updating_an_account_rejects_an_opening_date_on_or_after_the_first_real_entry() {
        let store = FakeStore::default();
        let created = create_account(&store, &store, input(1_000.0)).unwrap();
        store.add_real_entry(created.account.id, "2026-02-01", -25_00);

        for date in ["2026-02-01", "2026-03-01"] {
            let err = update_account(
                &store,
                &store,
                created.account.id,
                AccountInput {
                    created_date: IsoDate::parse(date).unwrap(),
                    ..input(1_000.0)
                },
            )
            .unwrap_err();

            assert_eq!(err, AccountError::OpeningDateNotBeforeFirstEntry);
        }

        // Rejected updates leave the account untouched.
        assert_eq!(
            store.system_entry_of(created.account.id),
            ("2026-01-15".to_owned(), 100_000)
        );
    }

    #[test]
    fn updating_an_account_accepts_an_opening_date_before_the_first_real_entry() {
        let store = FakeStore::default();
        let created = create_account(&store, &store, input(1_000.0)).unwrap();
        store.add_real_entry(created.account.id, "2026-02-01", -25_00);

        let updated = update_account(
            &store,
            &store,
            created.account.id,
            AccountInput {
                created_date: IsoDate::parse("2026-01-31").unwrap(),
                ..input(1_000.0)
            },
        )
        .unwrap();

        assert_eq!(updated.account.created_date.as_str(), "2026-01-31");
    }

    #[test]
    fn an_account_keeps_its_opening_date_editable_when_only_other_fields_change() {
        let store = FakeStore::default();
        let created = create_account(&store, &store, input(1_000.0)).unwrap();
        // An entry on the opening date itself: the invariant is already as
        // tight as it can get, but the account must stay editable.
        store.add_real_entry(created.account.id, "2026-01-15", -25_00);

        let updated = update_account(
            &store,
            &store,
            created.account.id,
            AccountInput {
                name: "Compte joint".to_owned(),
                ..input(1_000.0)
            },
        )
        .unwrap();

        assert_eq!(updated.account.name, "Compte joint");
    }

    #[test]
    fn updating_an_unknown_account_reports_it_as_missing() {
        let store = FakeStore::default();

        let err = update_account(&store, &store, 404, input(10.0)).unwrap_err();

        assert_eq!(err, AccountError::NotFound);
    }

    #[test]
    fn archiving_and_unarchiving_move_an_account_between_the_two_lists() {
        let store = FakeStore::default();
        let created = create_account(&store, &store, input(1_000.0)).unwrap();
        let id = created.account.id;

        archive_account(&store, id).unwrap();
        assert!(list_active_accounts(&store, &store).unwrap().is_empty());
        assert_eq!(list_archived_accounts(&store, &store).unwrap().len(), 1);

        unarchive_account(&store, id).unwrap();
        assert_eq!(list_active_accounts(&store, &store).unwrap().len(), 1);
        assert!(list_archived_accounts(&store, &store).unwrap().is_empty());
    }

    #[test]
    fn deleting_an_account_whose_register_holds_only_its_opening_balance_succeeds() {
        let store = FakeStore::default();
        let created = create_account(&store, &store, input(1_000.0)).unwrap();

        delete_account(&store, &store, created.account.id).unwrap();

        assert!(store.accounts.borrow().is_empty());
        assert!(store.entries.borrow().is_empty());
    }

    #[test]
    fn deleting_an_account_with_real_entries_is_refused() {
        let store = FakeStore::default();
        let created = create_account(&store, &store, input(1_000.0)).unwrap();
        store.add_real_entry(created.account.id, "2026-02-01", -25_00);

        let err = delete_account(&store, &store, created.account.id).unwrap_err();

        assert_eq!(err, AccountError::HasNonSystemEntries);
        assert_eq!(store.accounts.borrow().len(), 1);
    }

    #[test]
    fn deleting_an_unknown_account_reports_it_as_missing() {
        let store = FakeStore::default();

        let err = delete_account(&store, &store, 404).unwrap_err();

        assert_eq!(err, AccountError::NotFound);
    }
}
