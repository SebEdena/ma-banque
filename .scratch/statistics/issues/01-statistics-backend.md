# 01 — Statistics backend

**What to build:** Both statistics aggregates end to end at the backend boundary — category breakdown and month-bucketed income/expense — computed in SQL and exposed as commands. Done when both aggregates can be requested for an account and a period, purely through the command layer, with percentages/totals already computed.

**Blocked by:** None — can start immediately.

**Status:** done

- [ ] No schema change/migration — reads existing `entries`/`categories` columns only.
- [ ] `EntryRepository` gains a **category-breakdown aggregate** (`GROUP BY category_id` over an account + inclusive date range, expenses only, uncategorised rows collapsed into one null-category bucket, joined to category name/colour/icon) and a **month-bucketed aggregate** (`GROUP BY` month over the same account + range, summed income and summed expense totals per month). Both are single `GROUP BY` queries, not fetch-and-sum-in-Rust.
- [ ] Both aggregates exclude the system entry (`is_system = 1`) in their `WHERE` clauses.
- [ ] Amounts are reported as positive magnitudes (sign convention resolved in Rust, not left to the frontend).
- [ ] The category-breakdown response carries, per bucket, name/colour/icon/amount and **percentage of the period's expense total**, plus the period's expense total itself — percentages computed in Rust, never in Angular.
- [ ] The uncategorised bucket is labelled "Sans poste", sorted last regardless of size.
- [ ] The use case fills in months with zero activity so the monthly series always covers every month of the period in chronological order — done in the use case, not the SQL query.
- [ ] `usecases::statistics` accepts one of four period presets (1/3/6/12 months) and derives the inclusive `IsoDate` range (N months ending today) itself — the frontend never does date arithmetic.
- [ ] `domain::statistics` holds the response types and period enum; no new repository trait (methods live on `EntryRepository`); no new error enum (`EntryError` is reused).
- [ ] `commands::statistics` exposes the two aggregate commands.
- [ ] SQLite integration tests for the category-breakdown aggregate: entries across several categories sum per category; income entries excluded; `NULL` category_id entries collapse into exactly one bucket; system entry never appears; range boundaries inclusive at both ends (one day outside either end excluded); another account's entries never leak in.
- [ ] SQLite integration tests for the month-bucketed aggregate: same-month entries sum together, adjacent months don't; income/expense reported separately, both as positive magnitudes; a month with all-income entries reports zero expense (and vice versa); system entry excluded; range boundaries inclusive; another account's entries never leak in.
- [ ] Use-case tests against a hand-written in-memory fake `EntryRepository` (no `mockall`): each of the four presets derives the expected inclusive range ending today; months with no activity are filled as zero-valued; the series is chronologically ordered and covers every month of the period; percentages computed against the period's expense total; a period with no expenses yields an empty breakdown and zero total rather than a division error; the uncategorised bucket is labelled "Sans poste" and sorted last even when largest.
