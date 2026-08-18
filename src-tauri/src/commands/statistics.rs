//! Tauri commands for statistics aggregation.
//!
//! Cents become major units here, right before serialization
//! (technical-architecture.md §1.3), the same boundary `commands::account`
//! and `commands::entry` already own — the use case layer and the domain
//! response types stay in cents throughout.

use serde::Serialize;

use crate::domain::entry::{DynEntryRepository, EntryError, EntryKind};
use crate::domain::money;
use crate::domain::statistics::{
    CategoryBreakdownBucket, CategoryBreakdownResponse, MonthBucket, MonthBucketedResponse,
    PeriodPreset,
};
use crate::infra::clock;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct CategoryBreakdownBucketView {
    pub category_id: Option<i64>,
    pub name: String,
    pub color: String,
    pub icon: String,
    /// Major units.
    pub amount: f64,
    pub percentage: f64,
}

impl From<CategoryBreakdownBucket> for CategoryBreakdownBucketView {
    fn from(bucket: CategoryBreakdownBucket) -> Self {
        Self {
            category_id: bucket.category_id,
            name: bucket.name,
            color: bucket.color,
            icon: bucket.icon,
            amount: money::to_major(bucket.amount),
            percentage: bucket.percentage,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct CategoryBreakdownResponseView {
    pub buckets: Vec<CategoryBreakdownBucketView>,
    /// Major units.
    pub total: f64,
}

impl From<CategoryBreakdownResponse> for CategoryBreakdownResponseView {
    fn from(response: CategoryBreakdownResponse) -> Self {
        Self {
            buckets: response.buckets.into_iter().map(Into::into).collect(),
            total: money::to_major(response.total),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct MonthBucketView {
    pub month: String,
    /// Major units.
    pub income: f64,
    /// Major units.
    pub expense: f64,
}

impl From<MonthBucket> for MonthBucketView {
    fn from(bucket: MonthBucket) -> Self {
        Self {
            month: bucket.month,
            income: money::to_major(bucket.income),
            expense: money::to_major(bucket.expense),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct MonthBucketedResponseView {
    pub months: Vec<MonthBucketView>,
}

impl From<MonthBucketedResponse> for MonthBucketedResponseView {
    fn from(response: MonthBucketedResponse) -> Self {
        Self {
            months: response.months.into_iter().map(Into::into).collect(),
        }
    }
}

/// Expense category-breakdown aggregate for an account over a period preset.
#[tauri::command]
pub fn category_breakdown(
    entry_repo: tauri::State<'_, DynEntryRepository>,
    account_id: i64,
    preset: PeriodPreset,
) -> Result<CategoryBreakdownResponseView, EntryError> {
    crate::usecases::statistics::category_breakdown(
        &**entry_repo,
        account_id,
        preset,
        &clock::today(),
        EntryKind::Debit,
    )
    .map(Into::into)
}

/// Credit (income) category-breakdown aggregate for an account over a period
/// preset — mirrors `category_breakdown`, parameterized for credits.
#[tauri::command]
pub fn credit_breakdown(
    entry_repo: tauri::State<'_, DynEntryRepository>,
    account_id: i64,
    preset: PeriodPreset,
) -> Result<CategoryBreakdownResponseView, EntryError> {
    crate::usecases::statistics::category_breakdown(
        &**entry_repo,
        account_id,
        preset,
        &clock::today(),
        EntryKind::Credit,
    )
    .map(Into::into)
}

/// Month-bucketed aggregate for an account over a period preset,
/// with missing months filled in.
#[tauri::command]
pub fn month_bucketed(
    entry_repo: tauri::State<'_, DynEntryRepository>,
    account_id: i64,
    preset: PeriodPreset,
) -> Result<MonthBucketedResponseView, EntryError> {
    crate::usecases::statistics::month_bucketed(&**entry_repo, account_id, preset, &clock::today())
        .map(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn category_breakdown_amounts_cross_the_boundary_as_major_units() {
        let response = CategoryBreakdownResponse {
            buckets: vec![CategoryBreakdownBucket {
                category_id: Some(1),
                name: "Alimentation".to_owned(),
                color: "#10b981".to_owned(),
                icon: "lucideShoppingCart".to_owned(),
                amount: 123_456,
                percentage: 42.5,
            }],
            total: 290_500,
        };

        let view = CategoryBreakdownResponseView::from(response);

        assert_eq!(view.total, 2_905.00);
        assert_eq!(view.buckets[0].amount, 1_234.56);
        assert_eq!(view.buckets[0].percentage, 42.5);
    }

    #[test]
    fn month_bucketed_amounts_cross_the_boundary_as_major_units() {
        let response = MonthBucketedResponse {
            months: vec![MonthBucket {
                month: "2026-03".to_owned(),
                income: 250_000,
                expense: 98_450,
            }],
        };

        let view = MonthBucketedResponseView::from(response);

        assert_eq!(view.months[0].month, "2026-03");
        assert_eq!(view.months[0].income, 2_500.00);
        assert_eq!(view.months[0].expense, 984.50);
    }
}
