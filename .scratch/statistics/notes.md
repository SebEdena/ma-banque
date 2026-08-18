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

## Frontend Dependency Setup (Issue 02)

**Unovis Version:** 1.6.7 (stable)

- Installed as `@unovis/ts@1.6.7` and `@unovis/angular@1.6.7`
- Verified: 1.6.7 supports Angular ^22.1.0; a future upgrade to 1.7.0 final will provide explicit Angular 22 LTS tracking once released
- Modules imported by downstream components: `VisDonutModule`, `VisXYContainerModule`, `VisAxisModule`, `VisGroupedBarModule`
- No custom configuration needed; standard Angular module bootstrap is sufficient

**Frontend API Layer:** `StatisticsApi` service (src/app/data/statistics/statistics-api.ts)

- Mirrors existing pattern (AccountsApi, EntriesApi, CategoriesApi)
- Two methods: `categoryBreakdown(accountId, preset)` and `monthBucketed(accountId, preset)`
- Type definitions match Rust backend exactly: `PeriodPreset` (ONE_MONTH | THREE_MONTHS | SIX_MONTHS | TWELVE_MONTHS), `CategoryBreakdownResponse`, `MonthBucketedResponse`
- Error handling: `parseStatisticsError()` follows existing pattern (parseAccountError, parseCategoryError)
- Injectable singleton service; component tests mock this boundary, never `invoke()` directly

**Test Coverage:** 3 new tests added (unovis-smoke.spec.ts verifies module bootstrap; statistics-api.spec.ts tests error handling)

**Correction (Issue 03):** the two commands (`commands/statistics.rs`) originally returned `CategoryBreakdownResponse`/`MonthBucketedResponse` straight from the use case — i.e. amounts in **cents**, contradicting this section's claim above ("major units, already converted from cents") and `technical-architecture.md` §1.3's cents-boundary rule (`AccountView`/`EntryView` already convert at the command layer; statistics didn't). Fixed in Issue 03: `commands/statistics.rs` now has its own `CategoryBreakdownResponseView`/`MonthBucketedResponseView` (`From<...>` impls calling `money::to_major`), so the frontend types in `statistics-api.ts` were already correct and needed no change — only the backend crossed cents by mistake before this fix.

## Statistics Screen UI (Issue 03)

Built at `src/app/features/stats/` (component class `Stats`, selector `app-stats` — the directory is named `stats`, not `statistics`; a leftover empty `src/app/features/statistics/` directory is untracked and unused, ignore it).

**Route:** `/stats/:accountId` (registered in `src/app/app.routes.ts`; the route param was renamed from the scaffold's `:id` to `:accountId` to match the component's `accountId` input — `withComponentInputBinding()` binds by name, so a mismatch silently leaves the input `undefined`/`NaN` and the whole `@if (account(); ...)` block never renders — worth knowing if Issue 04's e2e navigates by URL directly instead of clicking through).

**Navigation entry point:** the entries screen's account header (`src/app/features/account/account.html`) has a new button, `data-testid="statistics-button"`, routerLink `['/stats', account.id]`, placed before the existing "Pointage" button (after the balance pill, in the header's flex row). Clicking it preselects the current account.

**On the statistics screen itself**, key `data-testid` hooks for e2e:

- `view-account-button` — "Voir le compte", routes back to `/account/:id`
- `period-control` — wraps the four period buttons, each `data-testid="period-ONE_MONTH"` / `period-THREE_MONTHS"` / `period-SIX_MONTHS"` / `period-TWELVE_MONTHS"` (matches the `PeriodPreset` wire values exactly)
- `account-pills` — wraps the pill row; each pill is `data-testid="account-pill-{id}"` (e.g. `account-pill-1`)
- `breakdown-card` / `donut-chart` (the `vis-single-container`) / `breakdown-legend` (with `legend-row`/`legend-swatch`/`legend-name`/`legend-percentage`/`legend-amount` inside) / `breakdown-empty` (the "Aucune dépense sur cette période." message, shown instead of the chart+legend when the breakdown is empty)
- `monthly-card` / `monthly-chart` (the `vis-xy-container`) / `monthly-legend`

**Testing note for Issue 04's e2e:** the two Unovis charts render into SVG via a `requestAnimationFrame`-deferred internal draw — real browsers handle this fine, but if a component-test-style assertion is ever needed against Unovis's bound data (not needed at e2e level, which should assert on visible DOM/data-testid content instead), see `stats.spec.ts` for the `By.directive(VisDonutComponent)`/`By.directive(VisGroupedBarComponent)` pattern and `vitest-base.config.ts` for a `@unovis/angular@1.6.7` packaging workaround (its ESM build has an extensionless barrel import that Node's/Vite's strict ESM resolver rejects — routed through Vite's own resolver instead via `server.deps.inline`).
