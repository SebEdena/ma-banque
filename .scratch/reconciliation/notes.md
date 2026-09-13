# Reconciliation — implementation notes

## Cross-issue notes

- **`ReconciliationRepository` (`domain::reconciliation`)** — three methods, all
  `Result<_, ReconciliationError>`:
  - `find_settings(account_id) -> Option<ReconciliationSettings>` — `None`
    means "no such account"; a known account with nothing set yet comes back
    as `Some(ReconciliationSettings::default())`.
  - `set_bank_balance(account_id, bank_balance: i64 /* cents */)`
  - `set_statement_date(account_id, statement_date: &IsoDate)`

  `ReconciliationSettings { bank_balance: Option<i64>, statement_date: Option<IsoDate> }`
  derives `Default`. `DynReconciliationRepository` is the boxed alias, managed
  in `lib.rs` like the other repositories.

- **`ReconciliationSummary` (`domain::reconciliation`)**, all cents/`IsoDate`:
  `statement_date: Option<IsoDate>`, `bank_balance: Option<i64>`,
  `reconciled_balance: Option<i64>`, `delta: Option<i64>`, `is_balanced: bool`,
  `unreconciled_count: i64`. `is_balanced` is **false whenever `delta` is
  `None`** — an account missing an input isn't balanced, it's unanswered.

- **`ReconciliationSummaryView` (`commands::reconciliation`)** is the wire
  shape: same field names, amounts as `Option<f64>` major units,
  `statement_date` as `Option<String>`. Field names stay snake_case on the
  wire, like `EntryView`. The frontend `ReconciliationApi` (issue 03) should
  mirror those names.

- **`ReconciliationError` variants**: `UnknownAccount`, `InvalidAmount(String)`,
  `InvalidDate(String)`, `Io(String)`. `#[serde(tag = "kind", content = "message")]`,
  so `UnknownAccount` serializes as `{ "kind": "UnknownAccount" }`.

- **Use-case signatures** all take both repositories, `ReconciliationRepository`
  first: `reconciliation_summary(settings_repo, entries, account_id)`,
  `set_bank_balance(settings_repo, entries, account_id, amount: f64)`,
  `set_statement_date(settings_repo, entries, account_id, date: &str)`.
  The last one parses the date **in the use case** (not at the command
  boundary, unlike `commands::entry`) so a malformed date is a
  `ReconciliationError::InvalidDate` rather than a deserialization failure.
  `set_bank_balance` calls `money::to_cents(amount)?` itself — the command
  passes the typed `f64` through untouched, exactly as the opening-balance
  field does.

- **`sum_reconciled_up_to` is a real SQL `SUM`**, not a fetch-and-sum-in-Rust
  like its sibling `sum_by_account` — the spec's "never load an unbounded row
  set to produce one integer". That means the debit/credit sign rule now has a
  SQL half, `infra::entry::SIGNED_AMOUNT_CENTS`
  (`CASE type WHEN 'DEBIT' THEN -amount ELSE amount END`), alongside
  `domain::entry::SignedCents`' Rust one. The test
  `sum_reconciled_up_to_matches_sum_by_account_when_nothing_is_filtered_out`
  pins the two together; **any new SQL aggregate over `entries.amount` should
  reuse that constant** (relevant to `09-statistics.md`'s per-category and
  per-month aggregates).

- **Migration count**: `infra::db::MIGRATION_COUNT` is now `7`. Whoever adds
  `0008` must bump it — the downgrade guard reads it.

- **`EntryListQuery` is untouched.** `unreconciled_only` (spec §"The
  'unreconciled only' filter") is **not** implemented here; it belongs to a
  later issue and will need `EntryListQuery`, `list_by_account`,
  `offset_for_date`, `ListEntriesInput` and `ListEntriesPayload` extended
  together. `07-recurring-entries.md` merging against this branch only sees
  two _added_ `EntryRepository` methods, no changed signatures.
  **Superseded by the `unreconciled_only` bullets below** — issue 02 has since
  landed on this branch and _does_ change both shapes.

- **`unreconciled_only` (issue 02) is a `bool` on `EntryListQuery`,
  `ListEntriesInput` and `ListEntriesPayload`**, and a new positional
  parameter on `EntryRepository::offset_for_date`, sitting between `to` and
  `sort`: `offset_for_date(account_id, from, to, unreconciled_only, sort,
target)`. Anyone rebasing `07-recurring-entries.md` or `09-statistics.md`
  onto this branch must add the field to every `EntryListQuery` literal and
  the parameter to every hand-written `EntryRepository` fake.

- **Wire name is `unreconciled_only`**, snake_case like the rest of
  `ListEntriesPayload`, and it is **required, not `#[serde(default)]`** — a
  frontend that forgets it fails loudly instead of silently returning an
  unfiltered page. `ListEntriesQuery` in `src/app/data/entries/entries-api.ts`
  carries it as a required `boolean`; `EntriesPager.fetchPage` currently
  hard-codes `false`. **Issue 03 owns replacing that literal** with the
  `panelOpen() && unreconciledOnly()` computed the spec describes — that is
  the only frontend seam issue 02 left behind.

- **The SQL predicate is `reconciled = 0` folded into the _existing_
  system-entry exemption**, not a clause of its own: both queries build their
  `WHERE` fragment through one shared
  `infra::entry::visibility_predicate(from, to, unreconciled_only)`, which
  emits `AND (is_system = 1 OR (<clauses joined by AND>))`. The system entry
  is therefore exempt from the reconciliation filter by the same mechanism
  that exempts it from the date range, and `list_by_account` /
  `offset_for_date` cannot drift apart — an offset computed under a different
  predicate than the page it indexes into points at the wrong row. Any later
  query needing the same visibility rules should call that function rather
  than re-spelling the clauses.

- **Issue 03's `data-testid` hooks**, for issue 04's E2E scenario:
  `reconciliation-toggle` (the "Pointage" open/close button, `aria-expanded`
  reflects `panelOpen()`), `reconciliation-panel` (the panel container, absent
  from the DOM when collapsed), `reconciliation-filter` (the "unreconciled
  only" checkbox), `reconciliation-reconciled-balance`,
  `reconciliation-bank-balance` (the editable input),
  `reconciliation-bank-balance-error` (inline validation message, present only
  on a rejected/non-numeric edit), `reconciliation-statement-date` (the
  editable input), `reconciliation-statement-date-prompt` (shown instead of
  the figures block when no statement date is set yet), `reconciliation-delta`
  and `reconciliation-verdict` (signed amount and the red/green verdict node,
  respectively — separate nodes, not one).

- **For the PR reviewer — two pre-existing `entries.e2e.ts` failures, not from
  this branch.** Running the full E2E suite locally on Linux (WSL2 + WSLg,
  webkit2gtk) against a wiped `.dev-data/`, `entries` › "creates a category
  from the entry row and leaves it selected" fails: after the inline
  category-create modal saves, `entry-form-category`'s trigger reads empty
  instead of the new category's name. "deletes the entry behind a
  confirmation naming it" then fails as a pure cascade — the previous test
  left the row in edit mode, so its `entry-label` span doesn't exist. Neither
  is reconciliation-related: `git diff 55d442c..HEAD` touches no file under
  `entry-form/`, `entry-row/`, or the category picker, and the assertion fires
  inside the entry form before any list refetch. E2E only runs on
  `windows-latest` in CI, so this may well be a Linux/WebKit-only difference
  in how the spartan select's trigger projects its label. Flagged, not fixed —
  outside this feature's scope.

- **Running the E2E suite locally** (not documented anywhere else, and `cargo
build` alone is not enough — a plain debug binary loads `devUrl` and the
  window comes up "Connection refused"): build the way `.github/workflows/
e2e.yml` does, `npx tauri build --debug --no-bundle --config
'{"build":{"beforeBuildCommand":"npm run build -- --configuration
development"}}'`, start `tauri-driver` (the config's `driverProvider` is
  `external`, so WDIO does not spawn it), then `npm run e2e`. Delete
  `.dev-data/` first — the suite is stateful and a second run against a
  populated folder fails from the smoke test onwards.

- **Issue 05 (Pointage default-off filter)**: `Account.togglePanel()` no
  longer sets `unreconciledOnly` to `true` on open — it leaves the checkbox
  exactly as the user last set it (it still starts `false` on first load, and
  panel-open/close never mutates it). `docs/spec/00-business-requirements.md`
  §4.3 and `docs/spec/08-reconciliation.md` were updated to state
  "unchecked by default" instead of "checked by default" — anything that
  still cites the old wording is out of date, not a divergent source of
  truth. `e2e/reconciliation.e2e.ts`'s Pointage scenario now explicitly clicks
  `reconciliation-filter` after opening the panel before asserting the list
  narrowed.
