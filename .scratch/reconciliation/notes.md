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
