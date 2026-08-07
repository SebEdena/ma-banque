# 02 — Postes tab: category management panel

**What to build:** From the Settings screen's "Postes" tab, the user sees the full category list (seeded + created), can create or edit a category (name, icon via keyword search, description, color), and delete one — blocked with a usage count when entries still reference it.

Scope, per `docs/spec/04-categories.md`:

- `CategoriesApi` injectable service wraps `invoke()` for `create_category`, `update_category`, `delete_category`, `list_categories`.
- Category list + create/edit modal built as the content of Settings' "Postes" sub-section — matching the prototype's card grid (per-card edit/delete icons) and "Nouveau poste" modal (name/icon-search/description/color) — using the sub-nav shell already established by `05-settings-remainder.md`, not a standalone routed component.
- Icon and color fields reuse the shared pickers from the accounts feature (`accounts` ticket 02) — not re-implemented here.
- Delete flow matches the prototype's two-step behavior: a plain confirm dialog when usage count is 0; a blocked message showing the usage count (no delete option) when non-zero.
- List re-fetches (or updates a local signal) after each mutation.
- The `categories` route/component scaffolded in `02-setup-frontend-ci.md` is retired (or repointed to redirect into Settings' "Postes" tab) by this ticket, since this spec always lands after the Settings shell.
- `CategoryError::InUse` surfaces as a toast; the modal's own field validation (empty name, no icon selected) is inline next to the field.

Out of scope: category hierarchy, custom icon upload, the entries-screen "quick-create category" shortcut (`06-entries.md`).

**Blocked by:** `categories` ticket 01 (this feature's backend), `accounts` ticket 02 (shared icon/color pickers), `settings-remainder` ticket 02 (Settings screen shell + Affichage tab — owns the sub-nav this tab plugs into)

**Status:** ready-for-agent

- [ ] Postes tab renders the category list (seeded + created) from `list_categories`
- [ ] Create/edit modal has name, icon (keyword-search picker from `accounts` ticket 02), description, color (picker from the same ticket) fields
- [ ] Delete: plain confirm when usage count is 0; blocked-with-count message (no delete option) when non-zero
- [ ] List re-fetches or updates locally after each mutation
- [ ] The old `categories` route/component from `02-setup-frontend-ci.md` is retired or redirected into Settings' Postes tab
- [ ] `CategoryError::InUse` surfaces as a toast; field validation is inline
- [ ] Component tests (Vitest) with mocked `CategoriesApi`: renders seeded/created list, delete blocked with error surfaced on `InUse`, icon-picker keyword search filters shown icons
