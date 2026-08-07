# 01 — Categories backend

**What to build:** A developer (and later the Postes tab) can create, edit, delete (guarded), and list `Category` entities through real Tauri commands, with a fresh database always starting from the twelve preconfigured categories.

Scope, per `docs/spec/04-categories.md`:

- New `categories` table (`id`, `name`, `color`, `icon`, `description`) — no `parent_id`/hierarchy column in v1, but shaped so adding one later is additive.
- `domain::category` (`Category`, `CategoryError`), `usecases::category` (`create_category`, `update_category`, `delete_category`, `list_categories`), `infra::category` (`SqliteCategoryRepository`), `commands::category` — mirrors the `Account` module shape one-for-one.
- Seed migration: the twelve preconfigured categories from business requirements §6 (name, suggested icon, suggested color), inserted once as part of the migration that creates the table — not application-startup logic. Seeded rows are ordinary, freely editable/deletable rows, no `is_preset` flag.
- `delete_category` checks for any entry referencing the category (a `count_by_category` addition to the minimal entry repository from the accounts feature's `entries` table) and returns `CategoryError::InUse` if any is found.
- `list_categories` returns rows sorted by `name`, case-insensitive.

Out of scope: any Postes tab UI (ticket 02), category hierarchy, custom icon upload, the entries-screen "quick-create category" shortcut (`06-entries.md`).

**Blocked by:** `accounts` ticket 01 — Accounts backend (provides the `entries` table and is the natural place `count_by_category` extends)

**Status:** ready-for-agent

- [ ] `categories` table exists via migration, seeded with exactly the twelve business-requirements §6 categories on a fresh database
- [ ] `domain::category`/`usecases::category`/`infra::category`/`commands::category` implement create/update/delete/list
- [ ] `delete_category` returns `CategoryError::InUse` when any entry references the category, and succeeds otherwise
- [ ] `list_categories` returns rows sorted by name, case-insensitive
- [ ] `CategoryError` is a `thiserror` enum, `#[derive(Serialize)]`
- [ ] Use-case tests against a hand-written in-memory fake `CategoryRepository` (no `mockall`)
- [ ] SQLite integration test asserting the seed migration inserts exactly the twelve categories on a fresh database, plus standard CRUD integration tests
- [ ] `cargo fmt --check`, `cargo clippy -- -D warnings`, and `cargo test` all pass locally
