# Statistics Feature — Cross-Issue Notes

## Repository Aggregate Methods

Both aggregate methods on `EntryRepository` are implemented as single SQL `GROUP BY` queries (not fetch-and-sum-in-Rust):

- **`category_breakdown_aggregate(account_id, from, to)`** — Returns `CategoryBreakdownResponse`:
  - `buckets: Vec<CategoryBreakdownBucket>` — one per category, plus one "Sans poste" for NULL category_id
  - Each bucket carries `category_id`, `name`, `color`, `icon`, `amount` (positive magnitude), and `percentage` (computed in Rust)
  - `total_expenses: i64` — sum of all expense amounts
  - Excludes: system entries (`is_system = 1`), income entries (`type = 'CREDIT'`)
  - Missing categories do not appear; uncategorised entries are collapsed into one bucket
  
- **`month_bucketed_aggregate(account_id, from, to)`** — Returns `MonthBucketedResponse`:
  - `months: Vec<MonthBucket>` — only months with at least one entry (gap-filling happens in the use case)
  - Each month carries `month` (YYYY-MM format), `income` (positive magnitude), `expense` (positive magnitude)
  - Excludes: system entries (`is_system = 1`)
  - Both income and expense reported as positive magnitudes for frontend ease of graphing

## Use Case Layer

`usecases::statistics` handles:
- **Period preset → date range derivation**: `PeriodPreset` enum (1/3/6/12 months) derives an inclusive `IsoDate` range ending today
- **Month gap-filling**: `month_bucketed()` calls the repository and fills missing months with zero-valued entries, so the series always covers every month of the period in order
- **No DateTime dependency**: Date arithmetic uses only standard library (`SystemTime` + manual leap-year logic), avoiding external dependencies

Date calculations are tested to verify presets derive the expected ranges and gap-filling covers every month of the period.

## Response Types

All types are in `domain::statistics`:
- `PeriodPreset` — the four preset enum values
- `CategoryBreakdownBucket` and `CategoryBreakdownResponse`
- `MonthBucket` and `MonthBucketedResponse`
- No new error enum; both aggregates reuse `EntryError`

## Tauri Commands

Two commands in `commands::statistics`:
- `category_breakdown(account_id, preset)` → `CategoryBreakdownResponse`
- `month_bucketed(account_id, preset)` → `MonthBucketedResponse`

Both are registered in `lib.rs`'s invoke handler and take the `DynEntryRepository` from Tauri state.

## Test Coverage

**SQLite integration tests** (13 total):
- 7 for category-breakdown: multi-category summing, income exclusion, system entry exclusion, NULL-category collapsing, range boundaries (inclusive both ends), account isolation, empty response
- 6 for month-bucketed: per-month summing, system entry exclusion, months-only-with-activity behavior, range boundaries, account isolation, empty response

**Use-case tests** (5 total):
- Period preset derivation: one-month and three-month presets resolve correctly
- Gap-filling: missing months filled with zeros, series is chronologically ordered, wraps year boundaries
- Empty period handling: returns empty when no activity

All tests use a hand-written in-memory `FakeRepo` (no `mockall`) and test behavior through public interfaces only.

**Test count**: 251 total (including all existing tests); 18 new statistics tests.
