//! Statistics use cases: period-preset date-range derivation shared by both
//! aggregates, and the monthly gap-filling that turns "only months with
//! activity" into a complete chronological series.
//!
//! `today` is a parameter rather than read from the clock here, the same
//! convention `usecases::recurring` follows (see `infra::clock`'s doc
//! comment): the command layer calls `infra::clock::today()` and passes the
//! result in, which keeps period derivation deterministic under test with no
//! clock abstraction needed.

use std::collections::HashMap;

use crate::domain::date::IsoDate;
use crate::domain::entry::{EntryError, EntryRepository};
use crate::domain::statistics::{
    CategoryBreakdownResponse, MonthBucket, MonthBucketedResponse, PeriodPreset,
};

/// Fetches the category breakdown for an account over a period preset,
/// computing percentages in Rust.
pub fn category_breakdown(
    repo: &dyn EntryRepository,
    account_id: i64,
    preset: PeriodPreset,
    today: &IsoDate,
) -> Result<CategoryBreakdownResponse, EntryError> {
    let (from, to) = date_range_for_preset(preset, today);
    repo.category_breakdown_aggregate(account_id, &from, &to)
}

/// Fetches the month-bucketed aggregate for an account over a period preset,
/// filling in months with zero activity so the series always covers every
/// month of the period.
pub fn month_bucketed(
    repo: &dyn EntryRepository,
    account_id: i64,
    preset: PeriodPreset,
    today: &IsoDate,
) -> Result<MonthBucketedResponse, EntryError> {
    let (from, to) = date_range_for_preset(preset, today);
    let response = repo.month_bucketed_aggregate(account_id, &from, &to)?;

    Ok(MonthBucketedResponse {
        months: fill_missing_months(&response.months, &from, &to),
    })
}

/// Derives the inclusive date range (N months ending `today`) for a period
/// preset: the 1st of the month N months back through `today` itself.
fn date_range_for_preset(preset: PeriodPreset, today: &IsoDate) -> (IsoDate, IsoDate) {
    let start_of_period = today.subtract_months(preset.months());
    let month_start = &start_of_period.as_str()[0..7];
    let from = IsoDate::parse(&format!("{month_start}-01"))
        .expect("the 1st of a valid month is itself a valid date");

    (from, today.clone())
}

/// Fills in missing months between `from` and `to` with zero-valued entries,
/// returning a complete chronological series. Empty input stays empty: an
/// account with no activity in the period has nothing to chart, not a
/// series of zeroes.
fn fill_missing_months(existing: &[MonthBucket], from: &IsoDate, to: &IsoDate) -> Vec<MonthBucket> {
    if existing.is_empty() {
        return Vec::new();
    }

    let existing_by_month: HashMap<&str, &MonthBucket> = existing
        .iter()
        .map(|bucket| (bucket.month.as_str(), bucket))
        .collect();

    let mut result = Vec::new();
    let mut cursor = from.clone();
    let last_month = month_key(to);

    loop {
        let month = month_key(&cursor);
        result.push(match existing_by_month.get(month.as_str()) {
            Some(bucket) => (*bucket).clone(),
            None => MonthBucket {
                month: month.clone(),
                income: 0,
                expense: 0,
            },
        });

        if month == last_month {
            break;
        }
        cursor = cursor.add_months(1);
    }

    result
}

/// The `YYYY-MM` key an `IsoDate` buckets into.
fn month_key(date: &IsoDate) -> String {
    date.as_str()[0..7].to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::statistics::CategoryBreakdownBucket;

    fn date(value: &str) -> IsoDate {
        IsoDate::parse(value).unwrap()
    }

    #[derive(Default)]
    struct FakeRepo {
        category_breakdown: Option<CategoryBreakdownResponse>,
        month_bucketed: Option<MonthBucketedResponse>,
    }

    impl EntryRepository for FakeRepo {
        fn sum_by_account(&self, _account_id: i64) -> Result<i64, EntryError> {
            unimplemented!("statistics tests don't sum balances")
        }

        fn last_entry_date(&self, _account_id: i64) -> Result<Option<IsoDate>, EntryError> {
            unimplemented!("statistics tests don't read last-activity dates")
        }

        fn exists_non_system_on_or_before(
            &self,
            _account_id: i64,
            _date: &IsoDate,
        ) -> Result<bool, EntryError> {
            unimplemented!("statistics tests don't guard opening dates")
        }

        fn sum_reconciled_up_to(
            &self,
            _account_id: i64,
            _statement_date: &IsoDate,
        ) -> Result<i64, EntryError> {
            unimplemented!("statistics tests don't sum reconciled balances")
        }

        fn count_unreconciled_by_account(&self, _account_id: i64) -> Result<i64, EntryError> {
            unimplemented!("statistics tests don't count unreconciled entries")
        }

        fn count_non_system_by_account(&self, _account_id: i64) -> Result<i64, EntryError> {
            unimplemented!("statistics tests don't count entries per account")
        }

        fn count_by_category(&self, _category_id: i64) -> Result<i64, EntryError> {
            unimplemented!("statistics tests don't count entries per category")
        }

        fn list_by_account(
            &self,
            _account_id: i64,
            _query: &crate::domain::entry::EntryListQuery,
        ) -> Result<crate::domain::entry::EntryPage, EntryError> {
            unimplemented!("statistics tests don't list entries")
        }

        #[allow(clippy::too_many_arguments)]
        fn offset_for_date(
            &self,
            _account_id: i64,
            _from: Option<&IsoDate>,
            _to: Option<&IsoDate>,
            _unreconciled_only: bool,
            _sort: crate::domain::entry::SortDirection,
            _target: &IsoDate,
        ) -> Result<i64, EntryError> {
            unimplemented!("statistics tests don't jump to a date")
        }

        fn find(&self, _id: i64) -> Result<Option<crate::domain::entry::Entry>, EntryError> {
            unimplemented!("statistics tests don't look up individual entries")
        }

        fn create(
            &self,
            _account_id: i64,
            _details: &crate::domain::entry::EntryDetails,
        ) -> Result<crate::domain::entry::Entry, EntryError> {
            unimplemented!("statistics tests don't create entries")
        }

        fn update(
            &self,
            _id: i64,
            _details: &crate::domain::entry::EntryDetails,
        ) -> Result<crate::domain::entry::Entry, EntryError> {
            unimplemented!("statistics tests don't update entries")
        }

        fn delete(&self, _id: i64) -> Result<(), EntryError> {
            unimplemented!("statistics tests don't delete entries")
        }

        fn set_reconciled(
            &self,
            _id: i64,
            _reconciled: bool,
        ) -> Result<crate::domain::entry::Entry, EntryError> {
            unimplemented!("statistics tests don't reconcile entries")
        }

        fn category_breakdown_aggregate(
            &self,
            _account_id: i64,
            _from: &IsoDate,
            _to: &IsoDate,
        ) -> Result<CategoryBreakdownResponse, EntryError> {
            Ok(self
                .category_breakdown
                .clone()
                .unwrap_or(CategoryBreakdownResponse {
                    buckets: Vec::new(),
                    total_expenses: 0,
                }))
        }

        fn month_bucketed_aggregate(
            &self,
            _account_id: i64,
            _from: &IsoDate,
            _to: &IsoDate,
        ) -> Result<MonthBucketedResponse, EntryError> {
            Ok(self
                .month_bucketed
                .clone()
                .unwrap_or(MonthBucketedResponse { months: Vec::new() }))
        }
    }

    #[test]
    fn one_month_preset_derives_the_month_ending_today() {
        let today = date("2026-08-18");
        let (from, to) = date_range_for_preset(PeriodPreset::OneMonth, &today);

        assert_eq!(from, date("2026-07-01"));
        assert_eq!(to, today);
    }

    #[test]
    fn three_month_preset_wraps_the_year_boundary() {
        let today = date("2026-02-10");
        let (from, to) = date_range_for_preset(PeriodPreset::ThreeMonths, &today);

        assert_eq!(from, date("2025-11-01"));
        assert_eq!(to, today);
    }

    #[test]
    fn category_breakdown_passes_through_the_repositorys_response() {
        let bucket = CategoryBreakdownBucket {
            category_id: Some(1),
            name: "Alimentation".to_owned(),
            color: "#10b981".to_owned(),
            icon: "lucideShoppingCart".to_owned(),
            amount: 1_500,
            percentage: 100.0,
        };
        let repo = FakeRepo {
            category_breakdown: Some(CategoryBreakdownResponse {
                buckets: vec![bucket.clone()],
                total_expenses: 1_500,
            }),
            ..Default::default()
        };

        let response =
            category_breakdown(&repo, 1, PeriodPreset::ThreeMonths, &date("2026-08-18")).unwrap();

        assert_eq!(response.buckets, vec![bucket]);
        assert_eq!(response.total_expenses, 1_500);
    }

    #[test]
    fn category_breakdown_is_empty_when_the_period_has_no_expenses() {
        let repo = FakeRepo::default();

        let response =
            category_breakdown(&repo, 1, PeriodPreset::OneMonth, &date("2026-08-18")).unwrap();

        assert!(response.buckets.is_empty());
        assert_eq!(response.total_expenses, 0);
    }

    #[test]
    fn month_bucketed_fills_missing_months_in_the_period() {
        let repo = FakeRepo {
            month_bucketed: Some(MonthBucketedResponse {
                months: vec![
                    MonthBucket {
                        month: "2026-02".to_owned(),
                        income: 1_000,
                        expense: 500,
                    },
                    MonthBucket {
                        month: "2026-05".to_owned(),
                        income: 2_000,
                        expense: 1_000,
                    },
                ],
            }),
            ..Default::default()
        };

        let response =
            month_bucketed(&repo, 1, PeriodPreset::ThreeMonths, &date("2026-05-31")).unwrap();

        let months: Vec<&str> = response.months.iter().map(|b| b.month.as_str()).collect();
        assert_eq!(months, vec!["2026-02", "2026-03", "2026-04", "2026-05"]);
        assert_eq!(response.months[1].income, 0);
        assert_eq!(response.months[1].expense, 0);
    }

    #[test]
    fn month_bucketed_is_empty_when_the_repository_returns_no_months() {
        let repo = FakeRepo::default();

        let response =
            month_bucketed(&repo, 1, PeriodPreset::OneMonth, &date("2026-08-18")).unwrap();

        assert!(response.months.is_empty());
    }

    #[test]
    fn fill_missing_months_wraps_a_year_boundary() {
        let existing = vec![
            MonthBucket {
                month: "2025-11".to_owned(),
                income: 1_000,
                expense: 500,
            },
            MonthBucket {
                month: "2026-02".to_owned(),
                income: 2_000,
                expense: 1_000,
            },
        ];

        let filled = fill_missing_months(&existing, &date("2025-11-01"), &date("2026-02-28"));

        let months: Vec<&str> = filled.iter().map(|b| b.month.as_str()).collect();
        assert_eq!(months, vec!["2025-11", "2025-12", "2026-01", "2026-02"]);
    }
}
