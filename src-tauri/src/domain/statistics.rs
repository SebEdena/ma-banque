//! Statistics aggregates over entries — category breakdown and monthly totals.
//! Per the spec, both aggregates are read-only and reuse `EntryError` rather
//! than defining a `StatisticsError`.

use serde::{Deserialize, Serialize};

/// One of the four fixed period presets for statistics queries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PeriodPreset {
    OneMonth,
    ThreeMonths,
    SixMonths,
    TwelveMonths,
}

impl PeriodPreset {
    pub fn months(&self) -> u32 {
        match self {
            PeriodPreset::OneMonth => 1,
            PeriodPreset::ThreeMonths => 3,
            PeriodPreset::SixMonths => 6,
            PeriodPreset::TwelveMonths => 12,
        }
    }
}

/// One bucket in the category-breakdown aggregate: a category and its
/// share of the period's total (expenses in the expense donut, credits in
/// the credit donut). `category_id` is `None` for the uncategorized bucket
/// ("Sans poste").
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CategoryBreakdownBucket {
    pub category_id: Option<i64>,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub amount: i64, // in cents, as positive magnitude
    pub percentage: f64,
}

/// Category-breakdown aggregate response: the period's buckets and their
/// total, for one sign (expense or credit) — the same shape serves both
/// donuts, parameterized by `EntryKind` at the repository call.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CategoryBreakdownResponse {
    pub buckets: Vec<CategoryBreakdownBucket>,
    pub total: i64, // in cents
}

/// One month's entry in the month-bucketed aggregate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MonthBucket {
    pub month: String, // "YYYY-MM" format
    pub income: i64,   // in cents, as positive magnitude
    pub expense: i64,  // in cents, as positive magnitude
}

/// Month-bucketed aggregate response: one row per month in the period,
/// including months with zero activity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MonthBucketedResponse {
    pub months: Vec<MonthBucket>,
}
