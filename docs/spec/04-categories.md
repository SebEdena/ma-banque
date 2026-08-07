# Spec — Categories

Complements [00-business-requirements.md](./00-business-requirements.md) and [technical-architecture.md](../architecture/technical-architecture.md). Builds on [01-setup-backend.md](./01-setup-backend.md) and [02-setup-frontend-ci.md](./02-setup-frontend-ci.md). Can be built in parallel with [03-accounts.md](./03-accounts.md) and [05-settings-remainder.md](./05-settings-remainder.md) — none of the three depends on the others.

## Problem Statement

There is no way yet to manage the global list of categories (_Postes_) that every entry will eventually be tagged with. The categories screen is an empty placeholder, and a fresh install has no starting categories at all.

## Solution

Implement the `Category` domain entity end to end — creation, editing, deletion (guarded), and a seeded starting list — and build the category management screen (business requirements §4.4): a global, flat list with name, color, icon and description, plus a Lucide icon picker with keyword search.

## User Stories

1. As a user, I want to create a category with a name, color, icon and description, so that I can tag entries in a way that's meaningful to me.
2. As a user, I want to edit an existing category's name, color, icon or description at any time, so that I can correct or refine my categorization scheme as it evolves.
3. As a user, I want category deletion blocked when any entry still uses that category, so that I never end up with entries silently pointing at a deleted category.
4. As a user, I want a dozen sensible categories (Groceries, Housing, Transport, ...) already present the first time I open the app, so that I don't have to build my category list from scratch before I can start using the app.
5. As a user, I want the category list to be global (shared across every account), so that I don't have to recreate the same categories per account.
6. As a user, I want to search the icon library by keyword when picking a category icon, so that I can find a relevant icon without scrolling a huge grid.
7. As a user, I want the category list on its management screen sorted predictably (e.g. alphabetically by name), so that I can find a category quickly as the list grows.
8. As a developer, I want the category data model to stay flat in v1 but not preclude a future two-level hierarchy (per business requirements §3.2), so that a later evolution doesn't require a breaking schema rewrite.
9. As a developer, I want `CategoryRepository` defined as a trait in `domain/` with a SQLite implementation in `infra/`, so that category persistence follows the same pattern as `AccountRepository`.
10. As a developer, I want category business errors (e.g. "in use, cannot delete") as a `thiserror` enum serialized to Angular, so that the UI can show a precise message rather than a generic failure.
11. As a user, I want the preconfigured categories to be regular, editable/deletable categories once seeded (not special-cased), so that I can freely adjust or remove any of them if they don't fit how I bank.

## Implementation Decisions

- **Schema**: new `categories` table (`id`, `name`, `color`, `icon`, `description`). No `parent_id`/hierarchy column added in v1 (business requirements §3.2 explicitly defers this), but the table and repository interface are kept narrow enough that adding one later is a pure additive migration, not a rewrite.
- **Module layout**: `domain::category` (`Category`, `CategoryError`), `usecases::category` (`create_category`, `update_category`, `delete_category`, `list_categories`), `infra::category` (`SqliteCategoryRepository`), `commands::category`. Mirrors the `Account` module shape from `03-accounts.md` one-for-one.
- **Deletion guard**: `delete_category` checks for any entry referencing the category via the minimal entry repository introduced in `03-accounts.md` (`category_id` column already exists on `entries`) and returns `CategoryError::InUse` if any is found. No new entry-repository method is needed beyond a `count_by_category` addition.
- **Seed data**: the twelve preconfigured categories from business requirements §6 (name, suggested icon, suggested color) are inserted as part of the same migration that creates the `categories` table — not as application-startup logic — so a fresh database always starts with them, once, deterministically. Seeded rows are ordinary rows: freely editable/deletable afterward, no `is_preset` flag.
- **Icon picker**: a shared component (introduced here, reused by `03-accounts.md` for account icons and available to any future spec needing an icon field) backed by a small bundled Lucide icon-name-to-keyword index for the search, not a live external lookup — keeps the picker offline and fast. Exact shared location is the implementer's call, coordinated with whichever of `03-accounts.md`/`04-categories.md` lands first.
- **Color picker**: same sharing arrangement as the icon picker — one control, used by both accounts and categories.
- **Frontend**: `CategoriesApi` injectable service wraps `invoke()` for `create_category`, `update_category`, `delete_category`, `list_categories`. `Categories` (categories.ts) renders the list plus inline/panel create-edit form (implementer's call on inline-row vs. modal, consistent with the picker components chosen); list re-fetches (or updates a local signal) after each mutation.
- **Ordering**: `list_categories` returns rows sorted by `name` (case-insensitive) — no user-configurable sort in v1.

## Testing Decisions

- Use case tests (`create_category`, `update_category`, `delete_category` guard, `list_categories`) against a hand-written in-memory fake `CategoryRepository` — no `mockall`, per `technical-architecture.md` §1.5.
- SQLite integration test asserting the seed migration inserts exactly the twelve business-requirements §6 categories on a fresh database, plus standard CRUD integration tests for `SqliteCategoryRepository`.
- Angular component tests (Vitest) for `Categories`: renders the seeded/created list from a mocked `CategoriesApi`, delete blocked with an error surfaced when the mocked API returns `InUse`, icon-picker keyword search filters the shown icons. Mock `CategoriesApi`, not `invoke()` directly, per the seam agreed for this and the other layer-1 specs.
- No new e2e scenario required by this spec alone.

## Out of Scope

- Category hierarchy (sub-categories) — explicitly deferred per business requirements §7.
- Anything on the entries screen itself, including the "quick-create a category from the entry form" shortcut mentioned in business requirements §4.3 — that shortcut is built in `06-entries.md`, reusing the create-category use case from this spec.
- Custom icon upload — explicitly out of scope for v1 per business requirements §7.
- Statistics' category breakdown (§4.5) — `09-statistics.md`.

## Further Notes

- The icon and color picker components built here are meant to be the single shared implementation `03-accounts.md` also uses — whichever spec is implemented first should build them in a reusable location; the second should import, not re-implement.
- The `InUse` deletion guard depends on the minimal `entries` table from `03-accounts.md` already existing; if this spec is built strictly before `03-accounts.md` in practice, that guard's integration test needs the `entries` table migration available too (the two specs don't depend on each other functionally, but this one query does need the table to exist).
