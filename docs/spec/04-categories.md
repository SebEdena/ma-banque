# Spec — Categories

Complements [00-business-requirements.md](./00-business-requirements.md) and [technical-architecture.md](../architecture/technical-architecture.md). Builds on [01-setup-backend.md](./01-setup-backend.md) and [02-setup-frontend-ci.md](./02-setup-frontend-ci.md). **Blocked by [05-settings-remainder.md](./05-settings-remainder.md)**, which must land first — it owns the Settings screen shell this spec's "Postes" tab plugs into (see note below). Otherwise independent of [03-accounts.md](./03-accounts.md).

## Problem Statement

There is no way yet to manage the global list of categories (_Postes_) that every entry will eventually be tagged with. The scaffolded `categories` route is an empty placeholder, and a fresh install has no starting categories at all.

## Solution

Implement the `Category` domain entity end to end — creation, editing, deletion (guarded), and a seeded starting list — and build the category management panel (business requirements §4.4): a global, flat list with name, color, icon and description, plus a Lucide icon picker with keyword search.

**Cross-checked against the existing prototype** (`docs/design/design.html`), per the open verification business requirements §8 asks for ("icon picker with keyword search — implementation state to confirm"). One thing it settles differently than business requirements §4's sidebar description: **category management ("Postes") is not its own top-level sidebar screen — it's a sub-section of the Settings screen**, alongside "Affichage" and "Stockage" (the ones `05-settings-remainder.md` builds), selected from a left-hand sub-nav within Settings. There is no "Postes" icon in the main icon rail. This spec therefore builds the categories panel as the content of Settings' "Postes" tab, not as a standalone routed screen — the already-scaffolded `categories` route (`02-setup-frontend-ci.md`) is retired by this spec (see Further Notes; this spec lands after `05-settings-remainder.md`, per the fixed order noted above, so it's the one that does the retiring). The icon picker (keyword search over a grid) and per-item edit/delete-with-usage-count behavior confirmed in the prototype match what's specified below.

## User Stories

1. As a user, I want to create a category with a name, color, icon and description, so that I can tag entries in a way that's meaningful to me.
2. As a user, I want to edit an existing category's name, color, icon or description at any time, so that I can correct or refine my categorization scheme as it evolves.
3. As a user, I want category deletion blocked when any entry still uses that category, so that I never end up with entries silently pointing at a deleted category.
4. As a user, I want a dozen sensible categories (Groceries, Housing, Transport, ...) already present the first time I open the app, so that I don't have to build my category list from scratch before I can start using the app.
5. As a user, I want the category list to be global (shared across every account), so that I don't have to recreate the same categories per account.
6. As a user, I want to search the icon library by keyword when picking a category icon, so that I can find a relevant icon without scrolling a huge grid.
7. As a user, I want the category list sorted predictably (e.g. alphabetically by name), so that I can find a category quickly as the list grows.
8. As a user, I want to reach category management from the Settings screen's "Postes" section, so that I find it where the app's other configuration lives rather than as a separate main-navigation item.
9. As a developer, I want the category data model to stay flat in v1 but not preclude a future two-level hierarchy (per business requirements §3.2), so that a later evolution doesn't require a breaking schema rewrite.
10. As a developer, I want `CategoryRepository` defined as a trait in `domain/` with a SQLite implementation in `infra/`, so that category persistence follows the same pattern as `AccountRepository`.
11. As a developer, I want category business errors (e.g. "in use, cannot delete") as a `thiserror` enum serialized to Angular, so that the UI can show a precise message rather than a generic failure.
12. As a user, I want the preconfigured categories to be regular, editable/deletable categories once seeded (not special-cased), so that I can freely adjust or remove any of them if they don't fit how I bank.

## Implementation Decisions

- **Schema**: new `categories` table (`id`, `name`, `color`, `icon`, `description`). No `parent_id`/hierarchy column added in v1 (business requirements §3.2 explicitly defers this), but the table and repository interface are kept narrow enough that adding one later is a pure additive migration, not a rewrite.
- **Module layout**: `domain::category` (`Category`, `CategoryError`), `usecases::category` (`create_category`, `update_category`, `delete_category`, `list_categories`), `infra::category` (`SqliteCategoryRepository`), `commands::category`. Mirrors the `Account` module shape from `03-accounts.md` one-for-one.
- **Deletion guard**: `delete_category` checks for any entry referencing the category via the minimal entry repository introduced in `03-accounts.md` (`category_id` column already exists on `entries`) and returns `CategoryError::InUse` if any is found. No new entry-repository method is needed beyond a `count_by_category` addition.
- **Seed data**: the twelve preconfigured categories from business requirements §6 (name, suggested icon, suggested color) are inserted as part of the same migration that creates the `categories` table — not as application-startup logic — so a fresh database always starts with them, once, deterministically. Seeded rows are ordinary rows: freely editable/deletable afterward, no `is_preset` flag.
- **Icon picker**: a shared component (introduced here, reused by `03-accounts.md` for account icons and available to any future spec needing an icon field) backed by a small bundled Lucide icon-name-to-keyword index for the search, not a live external lookup — keeps the picker offline and fast. Exact shared location is the implementer's call, coordinated with `03-accounts.md` (order between the two doesn't matter — see that spec's header; only the `05-settings-remainder.md` ordering is fixed).
- **Color picker**: same sharing arrangement as the icon picker — one control, used by both accounts and categories.
- **Frontend**: `CategoriesApi` injectable service wraps `invoke()` for `create_category`, `update_category`, `delete_category`, `list_categories`. The category list + create/edit modal (mirroring the prototype's card grid with per-card edit/delete icons, and a "Nouveau poste" modal with name/icon-search/description/color fields) is built as the content of Settings' "Postes" sub-section, using the sub-nav shell `05-settings-remainder.md` has already established by the time this spec lands — not as a standalone `Categories` component behind its own route. The scaffolded `categories` route and `Categories` component from `02-setup-frontend-ci.md` are retired by this spec (see Further Notes). List re-fetches (or updates a local signal) after each mutation. Delete confirmation follows the prototype's two-step flow: a plain confirm dialog when usage count is 0, a blocked-with-count message (no delete option) when it's non-zero.
- **Ordering**: `list_categories` returns rows sorted by `name` (case-insensitive) — no user-configurable sort in v1.
- **Error display**: `CategoryError::InUse` surfaces as a toast per `technical-architecture.md` §2.2; the create/edit modal's own field validation (empty name, no icon selected) is inline next to the field, not a toast.

## Testing Decisions

- Use case tests (`create_category`, `update_category`, `delete_category` guard, `list_categories`) against a hand-written in-memory fake `CategoryRepository` — no `mockall`, per `technical-architecture.md` §1.6.
- SQLite integration test asserting the seed migration inserts exactly the twelve business-requirements §6 categories on a fresh database, plus standard CRUD integration tests for `SqliteCategoryRepository`.
- Angular component tests (Vitest) for `Categories`: renders the seeded/created list from a mocked `CategoriesApi`, delete blocked with an error surfaced when the mocked API returns `InUse`, icon-picker keyword search filters the shown icons. Mock `CategoriesApi`, not `invoke()` directly, per the seam agreed for this and the other layer-1 specs.
- E2E (WebdriverIO, `e2e/categories.e2e.ts`): create a category from Settings' "Postes" sub-section, edit it, and delete it (covering both the confirm-dialog and blocked-with-count paths) — asserting on `data-testid` hooks, sharing the WDIO session per `technical-architecture.md` §2.3.

## Out of Scope

- Category hierarchy (sub-categories) — explicitly deferred per business requirements §7.
- Anything on the entries screen itself, including the "quick-create a category from the entry form" shortcut mentioned in business requirements §4.3 — that shortcut is built in `06-entries.md`, reusing the create-category use case from this spec.
- Custom icon upload — explicitly out of scope for v1 per business requirements §7.
- Statistics' category breakdown (§4.5) — `09-statistics.md`.

## Further Notes

- The icon and color picker components built here are meant to be the single shared implementation `03-accounts.md` also uses — whichever spec is implemented first should build them in a reusable location; the second should import, not re-implement.
- The `InUse` deletion guard depends on the minimal `entries` table from `03-accounts.md` already existing; if this spec is built strictly before `03-accounts.md` in practice, that guard's integration test needs the `entries` table migration available too (the two specs don't depend on each other functionally, but this one query does need the table to exist).
- **Fixed sequencing with `05-settings-remainder.md`**: this spec is declared blocked-by `05-settings-remainder.md` in the issue tracker (not just "coordinate informally") — the two aren't run as concurrent `fullstack-agent` features. `05-settings-remainder.md` always lands first and builds the Settings shell/sub-nav (Postes / Affichage / Stockage); this spec always lands second and fills in the "Postes" tab against an already-existing shell. This is a real (if narrow) UI dependency between the two specs, unlike the picker-sharing arrangement with `03-accounts.md`, which stays genuinely order-independent.
- The `categories` route/component scaffolded in `02-setup-frontend-ci.md` has no remaining job once this spec lands — this spec removes it (or repoints it to redirect into Settings' "Postes" tab, implementer's call), since the fixed landing order makes this spec unambiguously the one to do it.
