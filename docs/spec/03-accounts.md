# Spec — Accounts

Complements [00-business-requirements.md](./00-business-requirements.md) and [technical-architecture.md](../architecture/technical-architecture.md). Builds on [01-setup-backend.md](./01-setup-backend.md) and [02-setup-frontend-ci.md](./02-setup-frontend-ci.md). Can be built in parallel with [04-categories.md](./04-categories.md) and [05-settings-remainder.md](./05-settings-remainder.md) — none of the three depends on the others.

## Problem Statement

The scaffolding from `01-setup-backend.md`/`02-setup-frontend-ci.md` has no business entities at all: there is no way to create a bank account (a _Compte_), see the list of accounts, or edit one. The home screen and account screen are empty placeholders that don't call any real domain logic.

## Solution

Implement the `Account` domain entity end to end: creation (with its mandatory opening-balance system entry), listing, editing, archiving, and the deletion guard — backed by a real `accounts` table (plus the minimal `entries` table needed to hold the system entry and compute a balance). Build the home screen (business requirements §4.1) as the account-cards list, and the account settings screen (§4.2) as the dedicated edit form. The full entry-management feature (labels, categories, inline editing, filters, reconciliation) is **not** part of this spec — see "Out of Scope".

## User Stories

1. As a user, I want to create a new account with a name, color, icon and opening balance, so that I can start tracking a bank account in the app.
2. As a user, I want the account's creation date to default to today when I create it, so that I don't have to fill it in for the common case.
3. As a user, I want creating an account to generate a visible opening-balance line in its register, so that the account's balance starts from a known point rather than zero.
4. As a user, I want the home screen to show all my active accounts as cards (name, color, current balance), so that I get an overview of my finances at a glance.
5. As a user, I want archived accounts hidden from the home screen, so that closed accounts don't clutter my overview.
6. As a user, I want to click an account card and land on that account (routed to the entries screen, built in `06-entries.md`), so that navigation feels direct.
7. As a user, I want a dedicated account settings screen where I can edit an account's name, color, icon, opening date and opening balance, so that I can fix mistakes or update details without touching individual entries.
8. As a user, I want changing an account's opening date to retroactively move its system entry's date, so that the register stays internally consistent without me editing the system entry by hand.
9. As a user, I want the app to refuse an opening-date change that would land on or after the account's first real entry, so that the register's chronological order can never become inconsistent.
10. As a user, I want the opening balance to be editable only from the account settings screen, so that I can't accidentally alter it while entering day-to-day transactions (entries screen enforces this too, once built).
11. As a user, I want to archive an account instead of deleting it, so that I can hide an account I no longer use while keeping its history.
12. As a user, I want to be able to unarchive an account, so that I can bring a closed account back if I need it again.
13. As a user, I want account deletion blocked whenever the account has any entries (including just the system entry), so that I can never lose transaction history by mistake.
14. As a developer, I want `AccountRepository` defined as a trait in `domain/` with a SQLite implementation in `infra/`, so that account persistence follows the pattern established in `01-setup-backend.md`.
15. As a developer, I want account business errors (e.g. "has entries", "opening date not before first entry") as a `thiserror` enum serialized to Angular, so that the UI can show a precise, differentiated message per failure case.
16. As a developer, I want account creation, editing, archiving and the system entry write wrapped in one use case each, tested against hand-written in-memory fakes, so that business rules are verified without a database.
17. As a user, I want the sidebar's account rail (already part of the persistent navigation shell) to reflect the same active-accounts list as the home screen, so that the two navigation surfaces never disagree.
18. As a user, I want icon and color pickers on account creation/edit to be the same reusable controls used elsewhere in the app (categories, in `04-categories.md`), so that picking a color or icon feels consistent across screens.

## Implementation Decisions

- **Schema**: new `accounts` table (`id`, `name`, `color`, `icon`, `created_date`, `opening_balance`, `archived`, `last_viewed_date`) and a **minimal** `entries` table (`id`, `account_id`, `date`, `type` debit/credit, `amount`, `is_system`, `category_id` nullable, `reconciled` defaulting to false, `recurring_rule_id` nullable). Both land as `rusqlite_migration` `.sql` files in this spec. `category_id` is nullable specifically because the system entry has no category and the full `Category` feature (`04-categories.md`) may not exist yet in build order — the FK is added now so `06-entries.md` doesn't need a schema migration just to add the column.
- **Module layout**: `domain::account` (`Account`, `AccountError`), `usecases::account` (`create_account`, `update_account`, `archive_account`, `unarchive_account`, `delete_account`, `list_active_accounts`), `infra::account` (`SqliteAccountRepository` implementing `AccountRepository`), `commands::account` exposing each use case as a Tauri command. A parallel minimal `domain::entry` / `infra::entry` (`EntryRepository` with only the methods this spec needs: `insert_system_entry`, `update_system_entry_date_and_amount`, `sum_by_account`, `exists_non_system_before`) is introduced now and extended by `06-entries.md` — not duplicated.
- **Account creation flow**: `create_account` use case inserts the account row, then inserts the system entry (`is_system = true`, `date = created_date`, `amount = opening_balance`, `type` derived from the sign of `opening_balance`) in the same transaction, so an account can never exist without its system entry.
- **Balance calculation**: current balance = sum of all entries for the account (signed by `type`). At this layer, that's just the system entry; `06-entries.md` adds normal entries on top with no change to this formula.
- **Opening-date change**: `update_account` validates `new_created_date < first_non_system_entry_date` (via `exists_non_system_before`) before writing; on success, the account row and the system entry's `date` are updated in the same transaction. Opening-balance changes update the system entry's `amount`/`type` the same way.
- **Archiving**: `archived` is a plain boolean flip, no entry/reconciliation side effects. `list_active_accounts` filters `archived = false`; a separate `list_all_accounts` (or a filter param) backs a future "show archived" affordance if one is ever needed — not built in this spec since business requirements §4.1 don't call for it.
- **Deletion guard**: `delete_account` checks entry count (including the system entry) via the entry repository and returns `AccountError::HasEntries` if non-zero — in practice this means an account can only ever be deleted immediately after creation fails validation elsewhere, or never in normal use; that's expected per business requirements §3.1.
- **Frontend**: `AccountsApi` injectable service (`src/app/features/account` or a shared `core/` location — implementer's call) wraps `invoke()` for `create_account`, `update_account`, `archive_account`, `unarchive_account`, `list_active_accounts`. `Home` (home.ts) consumes `listActiveAccounts()` and renders cards (name, color, balance); the current data-folder plain-text proof from `02-setup-frontend-ci.md` is removed from `Home` now that it has a real job — the data-folder UI moves to `05-settings-remainder.md`. `Account` (account.ts) becomes the account-settings form (§4.2), driven by a route param for the account id.
- **Reconciliation indicator**: business requirements §4.1 call for a red/green reconciliation status per card. That indicator is **not** implemented here — see Out of Scope; cards in this spec show name, color and balance only.
- **Color/icon pickers**: built as shared, reusable components (not account-specific) since `04-categories.md` needs the same controls — implementer decides the exact shared location, but they must not be duplicated between the two specs. Icon library: Lucide, per business requirements §3.1/§3.2.

## Testing Decisions

- Use case tests (`create_account`, `update_account` incl. opening-date validation, `archive_account`, `delete_account` guard) against hand-written in-memory fakes of `AccountRepository`/the minimal entry repository — no `mockall`, per `technical-architecture.md` §1.5 and the pattern already used in `01-setup-backend.md`.
- SQLite integration tests for `SqliteAccountRepository` and the minimal entry repository methods, against a fresh `:memory:` database with migrations applied per test.
- Domain unit tests for balance calculation (sum of signed entries) and the opening-date-before-first-entry invariant.
- Angular component tests (Vitest) for `Home` (renders cards from a mocked `AccountsApi`, hides archived accounts) and `Account` (form validation, edit/archive actions call the right `AccountsApi` methods) — mock `AccountsApi`, not `invoke()` directly, per the seam agreed for this and the other layer-1 specs.
- No new e2e scenario is required by this spec alone; the existing smoke e2e from `02-setup-frontend-ci.md` continues to cover "app launches, shell renders."

## Out of Scope

- The entries screen itself (§4.3): inline entry CRUD, categories on entries, debit/credit sync, filters, pagination/virtual scroll — all of `06-entries.md`.
- Reconciliation (§3.5) and its red/green indicator on the home screen — `08-reconciliation.md`.
- Recurring entries (§3.4) and the "generate due occurrences on account open" behavior.
- Category management (§4.4) — `04-categories.md`; this spec only reserves the nullable `category_id` column.
- Date/currency display formatting (§4.6) — `05-settings-remainder.md`; this spec stores/returns raw values.
- Statistics (§4.5).

## Further Notes

- This spec is the first to touch real money data, so its migration files and the account/entry schema decided here are effectively locked in for every later spec — get the shape (especially the minimal `entries` table) reviewed carefully before merging, since `06-entries.md`, `07-recurring-entries.md`, `08-reconciliation.md` and `09-statistics.md` all build directly on top of it.
- The home screen's plain-text data-folder proof (from `02-setup-frontend-ci.md`) is retired here, not carried forward — `05-settings-remainder.md` gives that value a permanent home in the Settings screen instead.
