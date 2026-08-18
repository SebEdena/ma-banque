# Statistics Feature — Cross-Issue Notes

## RESUME HERE (session paused 2026-08-18 ~15:52, user shutting down PC)

**State when paused:**

- PR #12 (https://github.com/SebEdena/ma-banque/pull/12), branch `feature/statistics`, worktree `/home/edena/dev/MaBanque/ma-banque-statistics`. All 4 original issues done, first review round (8 comments) done/verified/replied, CI was fully green (`mergeStateStatus: CLEAN`) as of commit `7ce4160`.
- User then explicitly overrode one of the round's declines: **wants the credit/income breakdown implemented after all** (a second donut, not a toggle — user confirmed via AskUserQuestion).
- I updated `docs/spec/09-statistics.md` to reverse the expenses-only scope and spec a second "Répartition des recettes par poste" donut card (same `Donut`/legend/empty-state shape, "Total recettes" central label). Committed and pushed as `0ee38d1` — this commit IS on `origin/feature/statistics` already, safe.
- I then spawned a sonnet-tier agent to implement it (backend aggregate parameterized expense/credit, usecase/command surface, parameterize `BreakdownChart` for reuse across both donuts, tests at every layer, e2e update). **That agent was killed mid-task when the PC shut down — it had NOT committed or pushed anything yet** (verified: `git log`/`git status` on the worktree showed 0ee38d1 as HEAD, clean tree, no unpushed commits, right before shutdown). So no partial/half-finished credit-breakdown code exists anywhere — safe to just re-spawn the same task fresh.
- The PR-polling `ScheduleWakeup` loop was stopped cleanly before shutdown (no dangling wakeup will fire into a dead session).

**To resume:** re-run the credit-breakdown implementation from scratch (nothing to salvage/clean up). Read `docs/spec/09-statistics.md`'s "Credit breakdown" bullet (Implementation Decisions) and "Scope reversal (2026-08-18, PR #12 review)" note (Further Notes) for the exact spec — it's fully written, just not built yet. Then:

1. Spawn a sonnet-tier agent (per user's standing instruction: haiku for routine implementation, sonnet for anything review/design-judgment-adjacent — this counts, it touches the trait + 5 fake-repos + SQL) to build it: backend aggregate param (expense/credit) on `EntryRepository`, matching stub/impl work across `usecases::{account,category,entry,reconciliation,statistics}.rs`'s fakes, usecase/command surface, parameterize `BreakdownChart` (title/emptyMessage/centralSubLabel inputs, distinct testids per instance so two can render without collision), wire a second donut into `Stats`, tests at every layer (SQL integration, usecase, Angular component, e2e).
2. Verify on disk afterward (this repo's convention — don't trust self-reports): commits present, pushed, cargo/npm test counts sane, actual `vis-donut` usage count doubled in the template, PR reply posted on the `infra/entry.rs:473` thread explaining the reversal.
3. Resume the PR-polling loop (`actions/review/02-poll-pr.md`) once pushed — `.scratch/statistics/pr-poll-state.json` has `last_seen_comment_at: 2026-08-18T13:13:32Z`, `auto_resume_count: 1`, still accurate as of pause.

## PR #12 Review Pass (2026-08-18)

Eight `@agent-review` comments came back on the initial implementation. Outcomes, for whatever touches this feature next:

- **Income breakdown by category — UPDATE: this was declined during the review round below, then the user overrode that decision directly.** See "RESUME HERE" at the top of this file — the spec (`docs/spec/09-statistics.md`) now specs a second credit donut and implementation was in progress when the session paused. Do not re-decline this a second time; it's approved and spec'd.
- **The `unimplemented!()` stub methods in `usecases::{account,category,entry,reconciliation}.rs`'s test-only `Fake*Repository`s are not dead code.** They're this repo's no-`mockall` fake-repository convention (`technical-architecture.md` §1.6): each usecase's fake implements the _full_ `EntryRepository` trait so it compiles, with `unimplemented!()` on methods that usecase's tests never call. This PR's diff only added the two new stub methods (`category_breakdown_aggregate`/`month_bucketed_aggregate`) identically across all four files to keep them compiling after `EntryRepository` grew those two methods — pre-existing pattern, not a defect. `reconciliation.rs` was in this PR's diff (confirmed via `git log -p`) but the pattern itself predates it.
- **The two aggregate methods stay on `EntryRepository`, not extracted to a `domain::statistics` repository/trait.** The line the reviewer flagged (`domain/entry.rs`) is the trait method _declarations_, not aggregation logic — the response types they return already live in `domain::statistics`. The spec is explicit: "No new repository trait: the two aggregate methods go on `EntryRepository`". No change.
- **`usecases::statistics` restructured and its date arithmetic centralized.** It previously called `SystemTime::now()` directly and reimplemented epoch-to-calendar-date conversion plus leap-year handling by hand (~90 lines) instead of using what already existed: `infra::clock::today()` (the crate's one `chrono` call, per its own doc comment) and `domain::date::IsoDate`'s `add_months`/`add_weeks`/`add_years`. Fixed by:
  - Adding `IsoDate::subtract_months` (mirrors `add_months`, same day-clamping rule), tested the same way the existing `add_*` methods are.
  - `usecases::statistics::{category_breakdown, month_bucketed}` now take an explicit `today: &IsoDate` parameter instead of reading the clock themselves — the same convention `usecases::recurring` uses (see `infra::clock`'s doc comment: business logic takes the date as a parameter so it stays deterministic under test with no clock abstraction needed). `commands::statistics` now passes `&clock::today()`.
  - `PeriodPreset::months()` changed from `i32` to `u32` to match `subtract_months`'s signature.
  - File reordered to match `usecases::entry.rs`/`usecases::reconciliation.rs`: public API functions near the top, private helpers below, a hand-written `FakeRepo` test double (implementing the full `EntryRepository` trait, `unimplemented!()` for the unrelated methods) driving proper use-case-level tests of `category_breakdown`/`month_bucketed`, in addition to the lower-level date-range/gap-fill unit tests that were already there.
  - Behavior is unchanged: date-range derivation and gap-filling still produce the same results (existing test expectations — 1st of the month N back through today, inclusive — carried forward).
- **The Stats screen split into one component per chart plus the account selector**, per the reviewer's ask. `src/app/features/stats/` now has:
  - `account-pills/` (`AccountPills`) — presentational, `accounts`/`selectedAccountId` inputs, `accountSelected` output. Owns the account-pill row only; `Stats` still decides what a selection does (route navigation).
  - `breakdown-chart/` (`BreakdownChart`) — presentational, owns the whole "Répartition des dépenses par poste" card: the Unovis `Donut`, the hand-built legend, and the empty state. Takes `buckets`/`totalExpenses`/`loaded`/`currencyFormat` as inputs; `loaded` is what distinguishes "not yet requested" from "genuinely empty" so the empty message doesn't flash before the first load resolves.
  - `monthly-chart/` (`MonthlyChart`) — presentational, owns the whole "Recettes / Dépenses par mois" card: `GroupedBar`/`XYContainer`, axis, tooltip, legend. Takes `months`/`dateFormat`/`currencyFormat`.
  - `Stats` is now a pure container: fetches both aggregates, owns account/period selection state, and wires the three child components. All existing `data-testid` hooks (`breakdown-card`, `donut-chart`, `breakdown-legend`, `legend-row`/etc., `breakdown-empty`, `monthly-card`, `monthly-chart`, `monthly-legend`, `account-pills`, `account-pill-{id}`) are unchanged — they just live in the child templates now, so `09-statistics.md`'s e2e scenario (`e2e/statistics.e2e.ts`) needed no changes.
  - Chart-internals assertions (Unovis `data`/`color`/`x`/`y` bindings) moved from `stats.spec.ts` into `breakdown-chart.spec.ts`/`monthly-chart.spec.ts`; `account-pills.spec.ts` covers pill selection in isolation; `stats.spec.ts` stays container-level (data flow on load/period-change/account-change, error toast).

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

- **Period preset → date range derivation**: `PeriodPreset` enum (1/3/6/12 months) derives an inclusive `IsoDate` range ending `today`
- **Month gap-filling**: `month_bucketed()` calls the repository and fills missing months with zero-valued entries, so the series always covers every month of the period in order
- **`today` is a parameter, not read from the clock** (updated in the PR #12 review pass — see above): `category_breakdown`/`month_bucketed` take `today: &IsoDate`, and `commands::statistics` supplies it via `infra::clock::today()`. Date arithmetic goes through `IsoDate::add_months`/`subtract_months` rather than hand-rolled epoch/leap-year math — no `chrono` dependency added here, since `infra::clock` already owns the crate's one `chrono` call

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
- **Re-verified during the PR #12 review pass (2026-08-18):** `node_modules/@unovis/angular/package.json`'s `peerDependencies` declares `"@angular/core": "12 - 22"` (same for `@angular/common`/`@angular/compiler`), which covers this repo's `^22.1.0` — the check issue 02's AC2 asked for, confirmed a second time and written down here explicitly (previously only implied by the "Verified" line above). `unovis-smoke.spec.ts` (issue 02's AC3 smoke test) turned out to be a placebo — no real `@unovis/ts`/`@unovis/angular` import, assertions that couldn't fail — caught in the PR #12 review pass and deleted; AC3's actual coverage is the real `TestBed`-rendered `vis-donut`/`vis-xy-container` instances in `breakdown-chart.spec.ts`/`monthly-chart.spec.ts`/`stats.spec.ts`, which would fail to bootstrap if the package weren't correctly wired into the build.

**Frontend API Layer:** `StatisticsApi` service (src/app/data/statistics/statistics-api.ts)

- Mirrors existing pattern (AccountsApi, EntriesApi, CategoriesApi)
- Two methods: `categoryBreakdown(accountId, preset)` and `monthBucketed(accountId, preset)`
- Type definitions match Rust backend exactly: `PeriodPreset` (ONE_MONTH | THREE_MONTHS | SIX_MONTHS | TWELVE_MONTHS), `CategoryBreakdownResponse`, `MonthBucketedResponse`
- Error handling: `parseStatisticsError()` follows existing pattern (parseAccountError, parseCategoryError)
- Injectable singleton service; component tests mock this boundary, never `invoke()` directly

**Test Coverage:** `unovis-smoke.spec.ts` (module-bootstrap "test") was deleted in the PR #12 review pass — it was a placebo, see above; `statistics-api.spec.ts` (error handling) remains.

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
