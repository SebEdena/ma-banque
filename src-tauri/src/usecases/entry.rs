//! Entry business rules: the label/amount validations, the system-entry
//! write guard, and paginated/filtered/sorted listing (jump-to-date included).
//!
//! Amounts arrive here as the signed major-unit `f64` the debit/credit↔amount
//! sync already produced on the frontend and are converted to cents *here*,
//! before touching the domain or storage (technical-architecture.md §1.3);
//! [`crate::domain::entry::SignedCents::new`] derives the debit/credit kind
//! from the sign, so nothing upstream of this module has to send it
//! separately.

use crate::domain::date::IsoDate;
use crate::domain::entry::{
    Entry, EntryDetails, EntryError, EntryListQuery, EntryPage, EntryRepository, SignedCents,
    SortDirection,
};
use crate::domain::money;

/// Create/edit form input, exactly as it comes off the entry row.
#[derive(Debug, Clone, PartialEq)]
pub struct EntryInput {
    pub label: String,
    pub category_id: Option<i64>,
    pub date: IsoDate,
    /// Major units, signed — negative is a debit, positive (including zero)
    /// a credit.
    pub amount: f64,
    pub description: String,
}

impl EntryInput {
    fn validate(self) -> Result<EntryDetails, EntryError> {
        let label = self.label.trim();
        if label.is_empty() {
            return Err(EntryError::EmptyLabel);
        }

        Ok(EntryDetails {
            label: label.to_owned(),
            category_id: self.category_id,
            date: self.date,
            amount: SignedCents::new(money::to_cents(self.amount)?),
            description: self.description.trim().to_owned(),
        })
    }
}

/// The list screen's request: an optional inclusive date range, a sort
/// direction, a page size, and either a plain offset or a date to jump to —
/// `jump_to_date` takes priority when both are supplied.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListEntriesInput {
    pub from: Option<IsoDate>,
    pub to: Option<IsoDate>,
    pub unreconciled_only: bool,
    pub sort: SortDirection,
    pub page_size: i64,
    pub offset: i64,
    pub jump_to_date: Option<IsoDate>,
}

pub fn create_entry(
    entries: &dyn EntryRepository,
    account_id: i64,
    input: EntryInput,
) -> Result<Entry, EntryError> {
    entries.create(account_id, &input.validate()?)
}

pub fn update_entry(
    entries: &dyn EntryRepository,
    id: i64,
    input: EntryInput,
) -> Result<Entry, EntryError> {
    let details = input.validate()?;
    reject_system_entry(entries, id)?;
    entries.update(id, &details)
}

/// No soft-delete (business requirements §3.3): once accepted by the
/// frontend's confirmation dialog, the row is gone for good.
pub fn delete_entry(entries: &dyn EntryRepository, id: i64) -> Result<(), EntryError> {
    reject_system_entry(entries, id)?;
    entries.delete(id)
}

/// Its own narrow use case rather than folded into `update_entry`, so
/// toggling the row's checkbox doesn't require re-sending the whole payload.
pub fn set_reconciled(
    entries: &dyn EntryRepository,
    id: i64,
    reconciled: bool,
) -> Result<Entry, EntryError> {
    reject_system_entry(entries, id)?;
    entries.set_reconciled(id, reconciled)
}

pub fn list_entries(
    entries: &dyn EntryRepository,
    account_id: i64,
    input: ListEntriesInput,
) -> Result<EntryPage, EntryError> {
    let offset = match &input.jump_to_date {
        Some(target) => entries.offset_for_date(
            account_id,
            input.from.as_ref(),
            input.to.as_ref(),
            input.unreconciled_only,
            input.sort,
            target,
        )?,
        None => input.offset,
    };

    entries.list_by_account(
        account_id,
        &EntryListQuery {
            from: input.from,
            to: input.to,
            unreconciled_only: input.unreconciled_only,
            sort: input.sort,
            offset,
            limit: input.page_size,
        },
    )
}

fn reject_system_entry(entries: &dyn EntryRepository, id: i64) -> Result<(), EntryError> {
    let current = entries.find(id)?.ok_or(EntryError::NotFound)?;
    if current.is_system {
        return Err(EntryError::SystemEntryReadOnly);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct FakeStore {
        entries: RefCell<Vec<Entry>>,
        known_category_ids: RefCell<Vec<i64>>,
        next_id: RefCell<i64>,
    }

    impl FakeStore {
        fn with_system_entry(self, account_id: i64, date: &str, amount: i64) -> Self {
            let mut next = self.next_id.borrow_mut();
            *next += 1;
            self.entries.borrow_mut().push(Entry {
                id: *next,
                account_id,
                label: String::new(),
                category_id: None,
                date: IsoDate::parse(date).unwrap(),
                amount: SignedCents::new(amount),
                description: String::new(),
                is_system: true,
                reconciled: false,
                is_recurring: false,
            });
            drop(next);
            self
        }

        fn known_category(self, id: i64) -> Self {
            self.known_category_ids.borrow_mut().push(id);
            self
        }
    }

    impl EntryRepository for FakeStore {
        fn sum_by_account(&self, _account_id: i64) -> Result<i64, EntryError> {
            unimplemented!("entry rules don't sum balances")
        }

        fn last_entry_date(&self, _account_id: i64) -> Result<Option<IsoDate>, EntryError> {
            unimplemented!("entry rules don't read last-activity dates")
        }

        fn exists_non_system_on_or_before(
            &self,
            _account_id: i64,
            _date: &IsoDate,
        ) -> Result<bool, EntryError> {
            unimplemented!("entry rules don't guard opening dates")
        }

        fn sum_reconciled_up_to(
            &self,
            _account_id: i64,
            _statement_date: &IsoDate,
        ) -> Result<i64, EntryError> {
            unimplemented!("entry rules don't sum reconciled balances")
        }

        fn count_unreconciled_by_account(&self, _account_id: i64) -> Result<i64, EntryError> {
            unimplemented!("entry rules don't count unreconciled entries")
        }

        fn count_non_system_by_account(&self, _account_id: i64) -> Result<i64, EntryError> {
            unimplemented!("entry rules don't count entries per account")
        }

        fn count_by_category(&self, _category_id: i64) -> Result<i64, EntryError> {
            unimplemented!("entry rules don't count entries per category")
        }

        fn list_by_account(
            &self,
            account_id: i64,
            query: &EntryListQuery,
        ) -> Result<EntryPage, EntryError> {
            let mut matching: Vec<Entry> = self
                .entries
                .borrow()
                .iter()
                .filter(|e| {
                    e.account_id == account_id
                        && (e.is_system
                            || (query.from.as_ref().is_none_or(|from| &e.date >= from)
                                && query.to.as_ref().is_none_or(|to| &e.date <= to)
                                && (!query.unreconciled_only || !e.reconciled)))
                })
                .cloned()
                .collect();

            matching.sort_by(|a, b| match query.sort {
                SortDirection::Asc => (&a.date, a.id).cmp(&(&b.date, b.id)),
                SortDirection::Desc => (&b.date, b.id).cmp(&(&a.date, a.id)),
            });

            let offset = query.offset as usize;
            let limit = query.limit as usize;
            let has_more = matching.len() > offset + limit;
            let page = matching
                .into_iter()
                .skip(offset)
                .take(limit)
                .collect::<Vec<_>>();

            Ok(EntryPage {
                entries: page,
                has_more,
            })
        }

        fn offset_for_date(
            &self,
            account_id: i64,
            from: Option<&IsoDate>,
            to: Option<&IsoDate>,
            unreconciled_only: bool,
            sort: SortDirection,
            target: &IsoDate,
        ) -> Result<i64, EntryError> {
            let count = self
                .entries
                .borrow()
                .iter()
                .filter(|e| {
                    e.account_id == account_id
                        && (e.is_system
                            || (from.is_none_or(|from| &e.date >= from)
                                && to.is_none_or(|to| &e.date <= to)
                                && (!unreconciled_only || !e.reconciled)))
                        && match sort {
                            SortDirection::Desc => e.date > *target,
                            SortDirection::Asc => e.date < *target,
                        }
                })
                .count();
            Ok(count as i64)
        }

        fn find(&self, id: i64) -> Result<Option<Entry>, EntryError> {
            Ok(self.entries.borrow().iter().find(|e| e.id == id).cloned())
        }

        fn create(&self, account_id: i64, details: &EntryDetails) -> Result<Entry, EntryError> {
            if let Some(category_id) = details.category_id {
                if !self.known_category_ids.borrow().contains(&category_id) {
                    return Err(EntryError::UnknownCategory);
                }
            }

            let mut next = self.next_id.borrow_mut();
            *next += 1;
            let entry = Entry {
                id: *next,
                account_id,
                label: details.label.clone(),
                category_id: details.category_id,
                date: details.date.clone(),
                amount: details.amount,
                description: details.description.clone(),
                is_system: false,
                reconciled: false,
                is_recurring: false,
            };
            drop(next);
            self.entries.borrow_mut().push(entry.clone());
            Ok(entry)
        }

        fn update(&self, id: i64, details: &EntryDetails) -> Result<Entry, EntryError> {
            if let Some(category_id) = details.category_id {
                if !self.known_category_ids.borrow().contains(&category_id) {
                    return Err(EntryError::UnknownCategory);
                }
            }

            let mut entries = self.entries.borrow_mut();
            let entry = entries.iter_mut().find(|e| e.id == id).unwrap();
            entry.label = details.label.clone();
            entry.category_id = details.category_id;
            entry.date = details.date.clone();
            entry.amount = details.amount;
            entry.description = details.description.clone();
            Ok(entry.clone())
        }

        fn delete(&self, id: i64) -> Result<(), EntryError> {
            self.entries.borrow_mut().retain(|e| e.id != id);
            Ok(())
        }

        fn set_reconciled(&self, id: i64, reconciled: bool) -> Result<Entry, EntryError> {
            let mut entries = self.entries.borrow_mut();
            let entry = entries.iter_mut().find(|e| e.id == id).unwrap();
            entry.reconciled = reconciled;
            Ok(entry.clone())
        }
    }

    fn input(label: &str, date: &str, amount: f64) -> EntryInput {
        EntryInput {
            label: label.to_owned(),
            category_id: None,
            date: IsoDate::parse(date).unwrap(),
            amount,
            description: String::new(),
        }
    }

    #[test]
    fn creating_an_entry_derives_the_kind_from_the_amounts_sign() {
        let store = FakeStore::default();

        let debit = create_entry(&store, 1, input("Courses", "2026-02-01", -25.50)).unwrap();
        let credit = create_entry(&store, 1, input("Salaire", "2026-02-02", 1_500.0)).unwrap();

        assert_eq!(debit.amount.kind, crate::domain::entry::EntryKind::Debit);
        assert_eq!(debit.amount.amount, 2_550);
        assert_eq!(credit.amount.kind, crate::domain::entry::EntryKind::Credit);
        assert_eq!(credit.amount.amount, 150_000);
    }

    #[test]
    fn creating_an_entry_rejects_a_blank_label() {
        let store = FakeStore::default();

        let err = create_entry(&store, 1, input("   ", "2026-02-01", 10.0)).unwrap_err();

        assert_eq!(err, EntryError::EmptyLabel);
        assert!(store.entries.borrow().is_empty());
    }

    #[test]
    fn creating_an_entry_trims_its_label_and_description() {
        let store = FakeStore::default();

        let created = create_entry(
            &store,
            1,
            EntryInput {
                label: "  Courses  ".to_owned(),
                description: "  au marché  ".to_owned(),
                ..input("ignored", "2026-02-01", 10.0)
            },
        )
        .unwrap();

        assert_eq!(created.label, "Courses");
        assert_eq!(created.description, "au marché");
    }

    #[test]
    fn creating_an_entry_rejects_an_amount_finer_than_a_cent() {
        let store = FakeStore::default();

        let err = create_entry(&store, 1, input("Courses", "2026-02-01", 12.345)).unwrap_err();

        assert!(matches!(err, EntryError::InvalidAmount(_)));
    }

    #[test]
    fn creating_an_entry_with_an_unknown_category_is_refused() {
        let store = FakeStore::default();

        let err = create_entry(
            &store,
            1,
            EntryInput {
                category_id: Some(404),
                ..input("Courses", "2026-02-01", 10.0)
            },
        )
        .unwrap_err();

        assert_eq!(err, EntryError::UnknownCategory);
    }

    #[test]
    fn creating_an_entry_accepts_a_known_category() {
        let store = FakeStore::default().known_category(1);

        let created = create_entry(
            &store,
            1,
            EntryInput {
                category_id: Some(1),
                ..input("Courses", "2026-02-01", 10.0)
            },
        )
        .unwrap();

        assert_eq!(created.category_id, Some(1));
    }

    #[test]
    fn updating_an_entry_rewrites_every_editable_field() {
        let store = FakeStore::default();
        let created = create_entry(&store, 1, input("Courses", "2026-02-01", -10.0)).unwrap();

        let updated =
            update_entry(&store, created.id, input("Restaurant", "2026-02-05", -42.0)).unwrap();

        assert_eq!(updated.label, "Restaurant");
        assert_eq!(updated.date.as_str(), "2026-02-05");
        assert_eq!(updated.amount.amount, 4_200);
    }

    #[test]
    fn updating_an_unknown_entry_reports_it_as_missing() {
        let store = FakeStore::default();

        let err = update_entry(&store, 404, input("Courses", "2026-02-01", 10.0)).unwrap_err();

        assert_eq!(err, EntryError::NotFound);
    }

    #[test]
    fn updating_the_system_entry_is_refused() {
        let store = FakeStore::default().with_system_entry(1, "2026-01-15", 100_000);
        let system_id = store.entries.borrow()[0].id;

        let err =
            update_entry(&store, system_id, input("Courses", "2026-02-01", 10.0)).unwrap_err();

        assert_eq!(err, EntryError::SystemEntryReadOnly);
    }

    #[test]
    fn deleting_an_entry_removes_it() {
        let store = FakeStore::default();
        let created = create_entry(&store, 1, input("Courses", "2026-02-01", -10.0)).unwrap();

        delete_entry(&store, created.id).unwrap();

        assert!(store.entries.borrow().is_empty());
    }

    #[test]
    fn deleting_the_system_entry_is_refused() {
        let store = FakeStore::default().with_system_entry(1, "2026-01-15", 100_000);
        let system_id = store.entries.borrow()[0].id;

        let err = delete_entry(&store, system_id).unwrap_err();

        assert_eq!(err, EntryError::SystemEntryReadOnly);
        assert_eq!(store.entries.borrow().len(), 1);
    }

    #[test]
    fn deleting_an_unknown_entry_reports_it_as_missing() {
        let store = FakeStore::default();

        let err = delete_entry(&store, 404).unwrap_err();

        assert_eq!(err, EntryError::NotFound);
    }

    #[test]
    fn toggling_reconciled_flips_only_that_flag() {
        let store = FakeStore::default();
        let created = create_entry(&store, 1, input("Courses", "2026-02-01", -10.0)).unwrap();

        let toggled = set_reconciled(&store, created.id, true).unwrap();

        assert!(toggled.reconciled);
        assert_eq!(toggled.label, "Courses");
    }

    #[test]
    fn toggling_reconciled_on_the_system_entry_is_refused() {
        let store = FakeStore::default().with_system_entry(1, "2026-01-15", 100_000);
        let system_id = store.entries.borrow()[0].id;

        let err = set_reconciled(&store, system_id, true).unwrap_err();

        assert_eq!(err, EntryError::SystemEntryReadOnly);
    }

    fn list_input(sort: SortDirection) -> ListEntriesInput {
        ListEntriesInput {
            from: None,
            to: None,
            unreconciled_only: false,
            sort,
            page_size: 50,
            offset: 0,
            jump_to_date: None,
        }
    }

    #[test]
    fn listing_entries_sorts_most_recent_first_by_default() {
        let store = FakeStore::default();
        create_entry(&store, 1, input("A", "2026-02-01", -10.0)).unwrap();
        create_entry(&store, 1, input("B", "2026-02-03", -10.0)).unwrap();
        create_entry(&store, 1, input("C", "2026-02-02", -10.0)).unwrap();

        let page = list_entries(&store, 1, list_input(SortDirection::Desc)).unwrap();

        assert_eq!(
            page.entries
                .iter()
                .map(|e| e.label.clone())
                .collect::<Vec<_>>(),
            vec!["B", "C", "A"]
        );
    }

    #[test]
    fn listing_entries_can_be_reversed_to_oldest_first() {
        let store = FakeStore::default();
        create_entry(&store, 1, input("A", "2026-02-01", -10.0)).unwrap();
        create_entry(&store, 1, input("B", "2026-02-03", -10.0)).unwrap();

        let page = list_entries(&store, 1, list_input(SortDirection::Asc)).unwrap();

        assert_eq!(
            page.entries
                .iter()
                .map(|e| e.label.clone())
                .collect::<Vec<_>>(),
            vec!["A", "B"]
        );
    }

    #[test]
    fn listing_entries_filters_by_an_inclusive_date_range() {
        let store = FakeStore::default();
        create_entry(&store, 1, input("Too early", "2026-01-01", -10.0)).unwrap();
        create_entry(&store, 1, input("In range start", "2026-02-01", -10.0)).unwrap();
        create_entry(&store, 1, input("In range end", "2026-02-28", -10.0)).unwrap();
        create_entry(&store, 1, input("Too late", "2026-03-01", -10.0)).unwrap();

        let page = list_entries(
            &store,
            1,
            ListEntriesInput {
                from: Some(IsoDate::parse("2026-02-01").unwrap()),
                to: Some(IsoDate::parse("2026-02-28").unwrap()),
                ..list_input(SortDirection::Asc)
            },
        )
        .unwrap();

        assert_eq!(
            page.entries
                .iter()
                .map(|e| e.label.clone())
                .collect::<Vec<_>>(),
            vec!["In range start", "In range end"]
        );
    }

    #[test]
    fn listing_entries_always_includes_the_system_entry_regardless_of_the_date_filter() {
        let store = FakeStore::default().with_system_entry(1, "2020-01-01", 100_000);
        create_entry(&store, 1, input("In range", "2026-02-01", -10.0)).unwrap();

        let page = list_entries(
            &store,
            1,
            ListEntriesInput {
                from: Some(IsoDate::parse("2026-02-01").unwrap()),
                to: Some(IsoDate::parse("2026-02-28").unwrap()),
                ..list_input(SortDirection::Asc)
            },
        )
        .unwrap();

        assert!(page.entries.iter().any(|e| e.is_system));
    }

    #[test]
    fn listing_entries_paginates_with_a_has_more_flag() {
        let store = FakeStore::default();
        for day in 1..=5 {
            create_entry(
                &store,
                1,
                input("Entry", &format!("2026-02-{day:02}"), -10.0),
            )
            .unwrap();
        }

        let first_page = list_entries(
            &store,
            1,
            ListEntriesInput {
                page_size: 2,
                offset: 0,
                ..list_input(SortDirection::Asc)
            },
        )
        .unwrap();
        assert_eq!(first_page.entries.len(), 2);
        assert!(first_page.has_more);

        let last_page = list_entries(
            &store,
            1,
            ListEntriesInput {
                page_size: 2,
                offset: 4,
                ..list_input(SortDirection::Asc)
            },
        )
        .unwrap();
        assert_eq!(last_page.entries.len(), 1);
        assert!(!last_page.has_more);
    }

    #[test]
    fn jump_to_date_lands_on_the_page_containing_the_first_entry_at_or_before_the_target() {
        let store = FakeStore::default();
        for day in 1..=5 {
            create_entry(
                &store,
                1,
                input("Entry", &format!("2026-02-{day:02}"), -10.0),
            )
            .unwrap();
        }

        // Most-recent-first: 05, 04, 03, 02, 01. Jumping to 03 should land
        // right on it, at offset 2.
        let page = list_entries(
            &store,
            1,
            ListEntriesInput {
                page_size: 1,
                jump_to_date: Some(IsoDate::parse("2026-02-03").unwrap()),
                ..list_input(SortDirection::Desc)
            },
        )
        .unwrap();

        assert_eq!(page.entries[0].date.as_str(), "2026-02-03");
    }

    /// 02-01 and 02-03 ticked, 02-02 and 02-04 not.
    fn alternating_store() -> FakeStore {
        let store = FakeStore::default();
        for day in 1..=4 {
            let created = create_entry(
                &store,
                1,
                input("Entry", &format!("2026-02-{day:02}"), -10.0),
            )
            .unwrap();
            if day % 2 == 1 {
                set_reconciled(&store, created.id, true).unwrap();
            }
        }
        store
    }

    #[test]
    fn listing_with_unreconciled_only_drops_the_ticked_entries() {
        let store = alternating_store();

        let page = list_entries(
            &store,
            1,
            ListEntriesInput {
                unreconciled_only: true,
                ..list_input(SortDirection::Asc)
            },
        )
        .unwrap();

        let dates: Vec<&str> = page.entries.iter().map(|e| e.date.as_str()).collect();
        assert_eq!(dates, vec!["2026-02-02", "2026-02-04"]);
    }

    #[test]
    fn jump_to_date_resolves_its_offset_under_the_unreconciled_only_filter() {
        let store = alternating_store();

        // Ascending, only 02-02 matches ahead of the target, so the resolved
        // offset must be 1 rather than the unfiltered 3.
        let page = list_entries(
            &store,
            1,
            ListEntriesInput {
                unreconciled_only: true,
                page_size: 1,
                jump_to_date: Some(IsoDate::parse("2026-02-04").unwrap()),
                ..list_input(SortDirection::Asc)
            },
        )
        .unwrap();

        assert_eq!(page.entries[0].date.as_str(), "2026-02-04");
    }
}
