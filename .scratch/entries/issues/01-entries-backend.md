# 01 — Entries backend

**What to build:** A developer (and later the entries screen) can create, edit, delete, list (paginated, filtered, sorted), and toggle reconciliation on `Entry` entities through real Tauri commands, with the system entry protected from all of it.

Scope, per `docs/spec/06-entries.md`:

- New `migrations/0006_entries_label_description.sql` adding `label TEXT NOT NULL DEFAULT ''` and `description TEXT NOT NULL DEFAULT ''` to `entries`. The `DEFAULT ''` on `label` exists only to satisfy SQLite's `ALTER TABLE ADD COLUMN NOT NULL` mechanics for pre-existing rows (in particular the system entry, which carries no label) — it is not an invitation for a real entry to be saved with an empty label; that stays enforced as a hard rejection in `usecases::entry` (see below). `description` is genuinely optional — empty is a valid, permanent value there. `category_id`/`reconciled`/`recurring_rule_id` already exist; this is the first spec to populate `category_id` and `reconciled` on non-system rows.
- `EntryRepository` is **modified**, not purely extended: `list_by_account` (paginated, date-range filtered, sorted asc/desc by date with `id` tie-break, `has_more` flag instead of `COUNT(*)`, system entry always included regardless of filters), `find`, `create`, `update`, `delete`, `set_reconciled` are added. The five existing methods (`sum_by_account`, `last_entry_date`, `exists_non_system_on_or_before`, `count_non_system_by_account`, `count_by_category`) keep their signatures and behavior unchanged but are reworked internally to share row-mapping/query logic with the new methods (one row→`Entry` mapper reused by `sum_by_account`/`last_entry_date`/`list_by_account`/`find`; the two `COUNT(*)` methods stay dedicated queries). The three free functions in `infra::entry` (`insert_system_entry`, `update_system_entry_date_and_amount`, `delete_by_account`) are untouched.
- Jump-to-date: a `list_entries` variant/parameter that returns the page containing the first entry at or before a target date in the current sort order.
- `usecases::entry`: `create_entry`, `update_entry`, `delete_entry`, `list_entries`, `set_reconciled`. `EntryInput` (label, `category_id: Option<i64>`, date, debit/credit type, amount as typed major-unit `f64`, description) validated: empty label rejected, amount converted via `money::to_cents` (same rules as the opening-balance field), category existence relies on the DB foreign key and is mapped to `EntryError::UnknownCategory` rather than a redundant existence check. `create_entry`/`update_entry`/`delete_entry`/`set_reconciled` all reject `is_system = true` targets with `EntryError::SystemEntryReadOnly`.
- `commands::entry` exposes each use case as a Tauri command, mirroring the `Account`/`Category` module shape.
- `EntryError` as a `thiserror` enum (`SystemEntryReadOnly`, `UnknownCategory`, invalid amount, not found), `#[derive(Serialize)]`.

Out of scope: any entries-screen UI (tickets 02–04), the category quick-create shortcut's frontend (ticket 04), recurring-entry/`recurring_rule_id` population (`07-recurring-entries.md`), the reconciliation panel/aggregate calculations (`08-reconciliation.md`).

**Blocked by:** None — can start immediately.

**Status:** done

- [x] `migrations/0006_entries_label_description.sql` adds `label`/`description` columns as `NOT NULL DEFAULT ''` (the default exists for the pre-existing/system-entry rows only; it does not make an empty label valid for a real entry — see the validation criterion below)
- [x] `EntryRepository` gains `list_by_account`, `find`, `create`, `update`, `delete`, `set_reconciled`; the five pre-existing methods keep their signatures and observable behavior
- [x] `list_by_account` supports account_id, optional inclusive date-range filter, sort direction with `id` tie-break, offset/limit pagination with a `has_more` flag, and always includes the system entry regardless of filters
- [x] A jump-to-date path returns the page containing the first entry at or before a given date in the current sort order
- [x] `create_entry`/`update_entry`/`delete_entry`/`set_reconciled` reject the system entry with `EntryError::SystemEntryReadOnly`
- [x] `create_entry`/`update_entry` validate the label (non-empty) and amount (via `money::to_cents`), and surface an unknown `category_id` as `EntryError::UnknownCategory`
- [x] `commands::entry` exposes `create_entry`, `update_entry`, `delete_entry`, `list_entries`, `set_reconciled` as Tauri commands
- [x] `EntryError` is a `thiserror` enum, `#[derive(Serialize)]`
- [x] Use-case tests (create/update/delete/set_reconciled including system-entry rejection, list_entries covering date-range filtering, both sort directions, and pagination boundaries) against a hand-written in-memory fake `EntryRepository` (no `mockall`)
- [x] SQLite integration tests for the new repository methods against a fresh `:memory:` DB with migrations through `0006` applied, extending the existing `infra::entry` test module — including an unknown-`category_id` case and a case asserting the system entry is always included regardless of the date-range filter
- [x] The pre-existing `infra::entry` tests for `sum_by_account`, `last_entry_date`, `exists_non_system_on_or_before`, `count_non_system_by_account`, and `count_by_category` keep passing unchanged
- [x] `cargo fmt --check`, `cargo clippy -- -D warnings`, and `cargo test` all pass locally
