//! Category business rules: the name/icon validations, and the deletion
//! guard that stops entries being left pointing at a category that no longer
//! exists.

use crate::domain::category::{Category, CategoryDetails, CategoryError, CategoryRepository};
use crate::domain::entry::EntryRepository;

/// A category plus how many entries currently use it — the value the panel
/// shows on each card, and the one that decides whether deleting is offered
/// at all.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CategorySummary {
    pub category: Category,
    pub usage_count: i64,
}

/// Create/edit form input, exactly as it comes off the modal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CategoryInput {
    pub name: String,
    pub color: String,
    pub icon: String,
    pub description: String,
}

impl CategoryInput {
    fn validate(self) -> Result<CategoryDetails, CategoryError> {
        let name = self.name.trim();
        if name.is_empty() {
            return Err(CategoryError::EmptyName);
        }

        let icon = self.icon.trim();
        if icon.is_empty() {
            return Err(CategoryError::EmptyIcon);
        }

        Ok(CategoryDetails {
            name: name.to_owned(),
            color: self.color,
            icon: icon.to_owned(),
            description: self.description.trim().to_owned(),
        })
    }
}

pub fn create_category(
    categories: &dyn CategoryRepository,
    entries: &dyn EntryRepository,
    input: CategoryInput,
) -> Result<CategorySummary, CategoryError> {
    let category = categories.create(&input.validate()?)?;
    summarize(entries, category)
}

pub fn update_category(
    categories: &dyn CategoryRepository,
    entries: &dyn EntryRepository,
    id: i64,
    input: CategoryInput,
) -> Result<CategorySummary, CategoryError> {
    let category = categories.update(id, &input.validate()?)?;
    summarize(entries, category)
}

/// Entries keep their category for as long as they exist, so a category in
/// use can't be deleted — the user has to retag or remove those entries
/// first.
pub fn delete_category(
    categories: &dyn CategoryRepository,
    entries: &dyn EntryRepository,
    id: i64,
) -> Result<(), CategoryError> {
    if categories.find(id)?.is_none() {
        return Err(CategoryError::NotFound);
    }

    if entries.count_by_category(id)? > 0 {
        return Err(CategoryError::InUse);
    }

    categories.delete(id)
}

pub fn list_categories(
    categories: &dyn CategoryRepository,
    entries: &dyn EntryRepository,
) -> Result<Vec<CategorySummary>, CategoryError> {
    categories
        .list()?
        .into_iter()
        .map(|category| summarize(entries, category))
        .collect()
}

fn summarize(
    entries: &dyn EntryRepository,
    category: Category,
) -> Result<CategorySummary, CategoryError> {
    Ok(CategorySummary {
        usage_count: entries.count_by_category(category.id)?,
        category,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::date::IsoDate;
    use crate::domain::entry::EntryError;
    use std::cell::RefCell;

    /// In-memory `categories` + `entries` pair. The entry side only ever
    /// needs to answer "how many entries use this category", so it stores
    /// category ids rather than whole entries.
    #[derive(Default)]
    struct FakeStore {
        categories: RefCell<Vec<Category>>,
        entry_category_ids: RefCell<Vec<i64>>,
        next_id: RefCell<i64>,
    }

    impl FakeStore {
        fn tag_entry(&self, category_id: i64) {
            self.entry_category_ids.borrow_mut().push(category_id);
        }

        fn names(&self) -> Vec<String> {
            self.categories
                .borrow()
                .iter()
                .map(|c| c.name.clone())
                .collect()
        }
    }

    impl CategoryRepository for FakeStore {
        fn create(&self, details: &CategoryDetails) -> Result<Category, CategoryError> {
            let mut next = self.next_id.borrow_mut();
            *next += 1;

            let category = Category {
                id: *next,
                name: details.name.clone(),
                color: details.color.clone(),
                icon: details.icon.clone(),
                description: details.description.clone(),
            };
            self.categories.borrow_mut().push(category.clone());
            Ok(category)
        }

        fn update(&self, id: i64, details: &CategoryDetails) -> Result<Category, CategoryError> {
            let mut categories = self.categories.borrow_mut();
            let category = categories
                .iter_mut()
                .find(|c| c.id == id)
                .ok_or(CategoryError::NotFound)?;

            category.name = details.name.clone();
            category.color = details.color.clone();
            category.icon = details.icon.clone();
            category.description = details.description.clone();

            Ok(category.clone())
        }

        fn delete(&self, id: i64) -> Result<(), CategoryError> {
            self.categories.borrow_mut().retain(|c| c.id != id);
            Ok(())
        }

        fn find(&self, id: i64) -> Result<Option<Category>, CategoryError> {
            Ok(self
                .categories
                .borrow()
                .iter()
                .find(|c| c.id == id)
                .cloned())
        }

        fn list(&self) -> Result<Vec<Category>, CategoryError> {
            let mut categories = self.categories.borrow().clone();
            categories.sort_by_key(|c| c.name.to_lowercase());
            Ok(categories)
        }
    }

    impl EntryRepository for FakeStore {
        fn count_by_category(&self, category_id: i64) -> Result<i64, EntryError> {
            Ok(self
                .entry_category_ids
                .borrow()
                .iter()
                .filter(|id| **id == category_id)
                .count() as i64)
        }

        fn sum_by_account(&self, _account_id: i64) -> Result<i64, EntryError> {
            unimplemented!("category rules never read account balances")
        }

        fn last_entry_date(&self, _account_id: i64) -> Result<Option<IsoDate>, EntryError> {
            unimplemented!("category rules never read account activity dates")
        }

        fn exists_non_system_on_or_before(
            &self,
            _account_id: i64,
            _date: &IsoDate,
        ) -> Result<bool, EntryError> {
            unimplemented!("category rules never read account opening dates")
        }

        fn sum_reconciled_up_to(
            &self,
            _account_id: i64,
            _statement_date: &IsoDate,
        ) -> Result<i64, EntryError> {
            unimplemented!("category rules don't sum reconciled balances")
        }

        fn count_unreconciled_by_account(&self, _account_id: i64) -> Result<i64, EntryError> {
            unimplemented!("category rules don't count unreconciled entries")
        }

        fn count_non_system_by_account(&self, _account_id: i64) -> Result<i64, EntryError> {
            unimplemented!("category rules never count entries per account")
        }

        fn list_by_account(
            &self,
            _account_id: i64,
            _query: &crate::domain::entry::EntryListQuery,
        ) -> Result<crate::domain::entry::EntryPage, EntryError> {
            unimplemented!("category rules never list entries")
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
            unimplemented!("category rules never jump to a date")
        }

        fn find(&self, _id: i64) -> Result<Option<crate::domain::entry::Entry>, EntryError> {
            unimplemented!("category rules never look up individual entries")
        }

        fn create(
            &self,
            _account_id: i64,
            _details: &crate::domain::entry::EntryDetails,
        ) -> Result<crate::domain::entry::Entry, EntryError> {
            unimplemented!("category rules never create entries")
        }

        fn update(
            &self,
            _id: i64,
            _details: &crate::domain::entry::EntryDetails,
        ) -> Result<crate::domain::entry::Entry, EntryError> {
            unimplemented!("category rules never update entries")
        }

        fn delete(&self, _id: i64) -> Result<(), EntryError> {
            unimplemented!("category rules never delete entries")
        }

        fn set_reconciled(
            &self,
            _id: i64,
            _reconciled: bool,
        ) -> Result<crate::domain::entry::Entry, EntryError> {
            unimplemented!("category rules never reconcile entries")
        }

        fn category_breakdown_aggregate(
            &self,
            _account_id: i64,
            _from: &crate::domain::date::IsoDate,
            _to: &crate::domain::date::IsoDate,
        ) -> Result<crate::domain::statistics::CategoryBreakdownResponse, EntryError> {
            unimplemented!("category rules don't compute statistics")
        }

        fn month_bucketed_aggregate(
            &self,
            _account_id: i64,
            _from: &crate::domain::date::IsoDate,
            _to: &crate::domain::date::IsoDate,
        ) -> Result<crate::domain::statistics::MonthBucketedResponse, EntryError> {
            unimplemented!("category rules don't compute statistics")
        }
    }

    fn input(name: &str) -> CategoryInput {
        CategoryInput {
            name: name.to_owned(),
            color: "#10b981".to_owned(),
            icon: "lucideShoppingCart".to_owned(),
            description: "Courses, supermarché, marché".to_owned(),
        }
    }

    #[test]
    fn creating_a_category_round_trips_every_field() {
        let store = FakeStore::default();

        let created = create_category(&store, &store, input("Alimentation")).unwrap();

        assert_eq!(created.category.name, "Alimentation");
        assert_eq!(created.category.color, "#10b981");
        assert_eq!(created.category.icon, "lucideShoppingCart");
        assert_eq!(created.category.description, "Courses, supermarché, marché");
    }

    #[test]
    fn a_new_category_is_used_by_nothing_yet() {
        let store = FakeStore::default();

        let created = create_category(&store, &store, input("Alimentation")).unwrap();

        assert_eq!(created.usage_count, 0);
    }

    #[test]
    fn creating_a_category_rejects_a_blank_name() {
        let store = FakeStore::default();

        let err = create_category(&store, &store, input("   ")).unwrap_err();

        assert_eq!(err, CategoryError::EmptyName);
        assert!(store.categories.borrow().is_empty());
    }

    #[test]
    fn creating_a_category_rejects_a_missing_icon() {
        let store = FakeStore::default();

        let err = create_category(
            &store,
            &store,
            CategoryInput {
                icon: "  ".to_owned(),
                ..input("Alimentation")
            },
        )
        .unwrap_err();

        assert_eq!(err, CategoryError::EmptyIcon);
        assert!(store.categories.borrow().is_empty());
    }

    #[test]
    fn creating_a_category_trims_its_name_and_description() {
        let store = FakeStore::default();

        let created = create_category(
            &store,
            &store,
            CategoryInput {
                name: "  Loisirs  ".to_owned(),
                description: "  Cinéma, sport  ".to_owned(),
                ..input("ignored")
            },
        )
        .unwrap();

        assert_eq!(created.category.name, "Loisirs");
        assert_eq!(created.category.description, "Cinéma, sport");
    }

    #[test]
    fn a_category_may_have_no_description() {
        let store = FakeStore::default();

        let created = create_category(
            &store,
            &store,
            CategoryInput {
                description: String::new(),
                ..input("Divers")
            },
        )
        .unwrap();

        assert_eq!(created.category.description, "");
    }

    #[test]
    fn updating_a_category_rewrites_every_editable_field() {
        let store = FakeStore::default();
        let created = create_category(&store, &store, input("Alimentation")).unwrap();

        let updated = update_category(
            &store,
            &store,
            created.category.id,
            CategoryInput {
                name: "Courses".to_owned(),
                color: "#F87171".to_owned(),
                icon: "shopping-bag".to_owned(),
                description: "Supermarché".to_owned(),
            },
        )
        .unwrap();

        assert_eq!(updated.category.name, "Courses");
        assert_eq!(updated.category.color, "#F87171");
        assert_eq!(updated.category.icon, "shopping-bag");
        assert_eq!(updated.category.description, "Supermarché");
    }

    #[test]
    fn a_category_in_use_stays_editable() {
        let store = FakeStore::default();
        let created = create_category(&store, &store, input("Alimentation")).unwrap();
        store.tag_entry(created.category.id);

        let updated = update_category(
            &store,
            &store,
            created.category.id,
            CategoryInput {
                name: "Courses".to_owned(),
                ..input("ignored")
            },
        )
        .unwrap();

        assert_eq!(updated.category.name, "Courses");
        assert_eq!(updated.usage_count, 1);
    }

    #[test]
    fn updating_a_category_rejects_a_blank_name() {
        let store = FakeStore::default();
        let created = create_category(&store, &store, input("Alimentation")).unwrap();

        let err = update_category(&store, &store, created.category.id, input("  ")).unwrap_err();

        assert_eq!(err, CategoryError::EmptyName);
        assert_eq!(store.names(), ["Alimentation"]);
    }

    #[test]
    fn updating_an_unknown_category_reports_it_as_missing() {
        let store = FakeStore::default();

        let err = update_category(&store, &store, 404, input("Alimentation")).unwrap_err();

        assert_eq!(err, CategoryError::NotFound);
    }

    #[test]
    fn deleting_an_unused_category_succeeds() {
        let store = FakeStore::default();
        let created = create_category(&store, &store, input("Alimentation")).unwrap();

        delete_category(&store, &store, created.category.id).unwrap();

        assert!(store.categories.borrow().is_empty());
    }

    #[test]
    fn deleting_a_category_an_entry_still_uses_is_refused() {
        let store = FakeStore::default();
        let created = create_category(&store, &store, input("Alimentation")).unwrap();
        store.tag_entry(created.category.id);

        let err = delete_category(&store, &store, created.category.id).unwrap_err();

        assert_eq!(err, CategoryError::InUse);
        assert_eq!(store.names(), ["Alimentation"]);
    }

    #[test]
    fn deleting_a_category_ignores_entries_using_a_different_one() {
        let store = FakeStore::default();
        let unused = create_category(&store, &store, input("Alimentation")).unwrap();
        let used = create_category(&store, &store, input("Loisirs")).unwrap();
        store.tag_entry(used.category.id);

        delete_category(&store, &store, unused.category.id).unwrap();

        assert_eq!(store.names(), ["Loisirs"]);
    }

    #[test]
    fn deleting_an_unknown_category_reports_it_as_missing() {
        let store = FakeStore::default();

        let err = delete_category(&store, &store, 404).unwrap_err();

        assert_eq!(err, CategoryError::NotFound);
    }

    #[test]
    fn listing_categories_reports_each_ones_usage_count() {
        let store = FakeStore::default();
        let alimentation = create_category(&store, &store, input("Alimentation")).unwrap();
        create_category(&store, &store, input("Loisirs")).unwrap();
        store.tag_entry(alimentation.category.id);
        store.tag_entry(alimentation.category.id);

        let listed = list_categories(&store, &store).unwrap();

        assert_eq!(listed[0].usage_count, 2);
        assert_eq!(listed[1].usage_count, 0);
    }

    #[test]
    fn listing_categories_on_an_empty_store_returns_nothing() {
        let store = FakeStore::default();

        assert!(list_categories(&store, &store).unwrap().is_empty());
    }
}
