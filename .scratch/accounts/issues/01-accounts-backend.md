# 01 — Accounts backend

**What to build:** A developer (and later the home screen) can create, list, edit, archive, unarchive, and delete an `Account` through real Tauri commands, with every account carrying a mandatory opening-balance system entry that keeps its balance correct from creation onward.

Scope, per `docs/spec/03-accounts.md`:

- New `accounts` table (`id`, `name`, `color`, `icon`, `created_date`, `opening_balance`, `archived`, `last_viewed_date`) and a **minimal** `entries` table (`id`, `account_id`, `date`, `type` debit/credit, `amount`, `is_system`, `category_id` nullable, `reconciled` defaulting to false, `recurring_rule_id` nullable), as `rusqlite_migration` files. `opening_balance`/`amount` are `INTEGER` cents columns — this spec establishes the cents-storage convention every later monetary spec follows.
- `domain::account` (`Account`, `AccountError`), `usecases::account` (`create_account`, `update_account`, `archive_account`, `unarchive_account`, `delete_account`, `list_active_accounts`, `list_archived_accounts`), `infra::account` (`SqliteAccountRepository`), `commands::account`.
- A parallel minimal `domain::entry`/`infra::entry` with only the methods this spec needs (`insert_system_entry`, `update_system_entry_date_and_amount`, `sum_by_account`, `exists_non_system_before`, `count_non_system_by_account`) — extended, not duplicated, by `06-entries.md`.
- `create_account` inserts the account row and its system entry (`is_system = true`, `date = created_date`, `amount = opening_balance`) in one transaction. Balance = signed sum of an account's entries.
- `update_account`'s opening-date change validates `new_created_date < first_non_system_entry_date` before writing, updating the account row and system entry's date/amount together.
- `delete_account` checks `count_non_system_by_account` and returns `AccountError::HasNonSystemEntries` if non-zero — deletion is only ever possible for an archived account with no activity beyond its opening balance.
- Commands return balances as a plain major-unit number (Rust divides once at the command boundary); the opening-balance input on create/update is accepted as the user's typed major-unit `f64`, converted/rounded to cents inside the use case.

Out of scope: any home-screen or modal UI (tickets 03/04), the archived-view restore/delete UI (ticket 05), the entries screen itself (`06-entries.md`), categories (`04-categories.md` — only the nullable `category_id` column is reserved here).

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `accounts` and minimal `entries` tables exist via migrations, with `opening_balance`/`amount` as cents `INTEGER`
- [ ] `domain::account`/`usecases::account`/`infra::account`/`commands::account` implement create/update/archive/unarchive/delete/list_active/list_archived
- [ ] `create_account` writes the account and its system entry in one transaction
- [ ] `update_account` rejects an opening-date change landing on/after the first non-system entry, and otherwise updates the system entry's date/amount alongside the account row
- [ ] `delete_account` returns `AccountError::HasNonSystemEntries` when non-system entries exist, and succeeds otherwise
- [ ] Balance = signed sum of entries for the account
- [ ] `AccountError` is a `thiserror` enum, `#[derive(Serialize)]`
- [ ] Commands convert cents↔major-unit at the boundary; use cases (not Angular) own the `f64 → cents` rounding decision
- [ ] Use-case tests against hand-written in-memory fakes (no `mockall`), covering create, opening-date validation, archive/unarchive, delete guard (blocked and allowed cases)
- [ ] SQLite integration tests for `SqliteAccountRepository` and the minimal entry repository methods
- [ ] `cargo fmt --check`, `cargo clippy -- -D warnings`, and `cargo test` all pass locally
