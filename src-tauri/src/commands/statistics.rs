//! Tauri commands for statistics aggregation.

use crate::domain::entry::{DynEntryRepository, EntryError};
use crate::domain::statistics::PeriodPreset;

/// Category-breakdown aggregate for an account over a period preset.
#[tauri::command]
pub fn category_breakdown(
    entry_repo: tauri::State<'_, DynEntryRepository>,
    account_id: i64,
    preset: PeriodPreset,
) -> Result<crate::domain::statistics::CategoryBreakdownResponse, EntryError> {
    crate::usecases::statistics::category_breakdown(&**entry_repo, account_id, preset)
}

/// Month-bucketed aggregate for an account over a period preset,
/// with missing months filled in.
#[tauri::command]
pub fn month_bucketed(
    entry_repo: tauri::State<'_, DynEntryRepository>,
    account_id: i64,
    preset: PeriodPreset,
) -> Result<crate::domain::statistics::MonthBucketedResponse, EntryError> {
    crate::usecases::statistics::month_bucketed(&**entry_repo, account_id, preset)
}
