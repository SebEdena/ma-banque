# categories — cross-issue notes

## Cross-issue notes

Decisions from issue 01 (backend) that issue 02 (Postes tab UI) depends on.

- **Command names** are exactly `list_categories`, `create_category`, `update_category`, `delete_category` (registered in `src-tauri/src/lib.rs`).
- **Command signatures** (arguments as Angular passes them through `invoke()`):
  - `list_categories()` -> `CategoryView[]`
  - `create_category({ input })` -> `CategoryView`
  - `update_category({ id, input })` -> `CategoryView`
  - `delete_category({ id })` -> `void`
  - `input` is `{ name, color, icon, description }`, all four `string` and all four required — pass `""` for an empty description rather than omitting it or sending `null`.
- **`CategoryView` shape** (snake_case on the wire, no serde rename): `{ id: number, name: string, color: string, icon: string, description: string, usage_count: number }`.
  - `usage_count` is how many entries reference the category. It's what the card grid's usage count renders, and what decides the two-step delete flow (0 -> confirm dialog, non-zero -> blocked-with-count message). The UI does not need a separate count call.
  - `description` is never null — the column is `TEXT NOT NULL DEFAULT ''`.
  - `color` is a hex string including the leading `#` (e.g. `#4ADE80`); `icon` is a bare Lucide icon name (e.g. `shopping-cart`), no prefix or file extension.
- **`CategoryError` variants**, serialized as `{ kind, message }` exactly like `AccountError`: `NotFound`, `EmptyName`, `EmptyIcon`, `InUse`, `Io`. Angular maps each `kind` to French UI wording, same as `parseSettingsError` in `core/settings-api`.
  - `InUse` is a unit variant and carries no count — read the count from the category's `usage_count` instead.
  - `EmptyName` and `EmptyIcon` are the backend backstop for the modal's inline field validation; the UI should still validate inline before calling.
  - The backend trims `name`, `icon` and `description` before storing.
- **Seeded categories**: the twelve from business requirements §6 are inserted by `migrations/0005_create_categories.sql`, French names, with the descriptions the prototype (`docs/design/design.html`) shows. They are ordinary rows — no `is_preset` flag, freely editable and deletable, so the UI must not special-case them.
- **List order** is `ORDER BY name COLLATE FRENCH_NOCASE, id`, applied in the repository, so `list_categories` is already sorted and the UI should not re-sort. `FRENCH_NOCASE` is a custom collation (`infra/collation.rs`) that folds case *and* accents, registered by `infra::db` on every connection it opens — SQLite's built-in `NOCASE` only folds ASCII, which pushed "Épargne / Investissement" past "Transport". **Any future `ORDER BY` on a user-facing name must use it too** (`infra::account::list` already does), and any code path that opens its own `Connection` for querying has to call `collation::register` first or the query fails with "no such collation sequence".
- **`entries.category_id` now has a real foreign key** to `categories(id)`, added by rebuilding the `entries` table in migration 0005 (0004 created the column without the constraint because `categories` didn't exist yet). Deleting a category that entries reference fails at the database level as well as via the `InUse` guard.
- **`EntryRepository` gained `count_by_category(category_id)`** — `06-entries.md` inherits it.

Decisions from issue 02 (Postes tab UI) that later issues inherit.

- **`icon` and `color` hold picker vocabulary, not raw Lucide/Tailwind values.** Issue 01 seeded kebab-case Lucide names (`shopping-cart`) and business requirements §6's hex colours, but the shared pickers (`shared/pickers/icon-catalog.ts`, `color-swatches.ts`) persist ng-icons names (`lucideShoppingCart`) and their own ten-swatch palette. Issue 02 re-seeded migration 0005 to the picker vocabulary rather than translating in the UI: an unregistered icon name renders as nothing, and an off-palette colour leaves the edit modal with no swatch selected. **Anything writing a category — including `06-entries.md`'s quick-create shortcut — must use `ICON_CATALOG` names and `COLOR_SWATCHES` values.** Three icons were added to the catalogue for the seeds (`lucidePartyPopper`, `lucideRepeat`, `lucideEllipsis`).
- **`CategoriesApi` (`core/categories-api/categories-api.ts`)** is the seam to mock — never `invoke()` — plus `parseCategoryError` for the French toast wording. `InMemoryCategoriesApi` backs `npm run start:mock`.
- **The quick-create shortcut `06-entries.md` owns** should open `CategoryModal` (`features/settings/categories/category-modal/`) rather than build a second form. It takes an optional `category` input (`null` = create), emits `saved`/`cancelled`, and calls `CategoriesApi` itself — so the caller only re-fetches its own list on `saved`.
- **Delete branches on `usage_count` before calling**, showing the prototype's blocked-with-count dialog instead of a delete action; the `InUse` toast is only the backstop for a stale count.
- **The scaffolded `categories` route is retired**: the component moved to `features/settings/categories/` alongside `display-format`/`storage`, still behind `/settings/categories` (the Postes sub-nav link is unchanged).
- **No E2E spec was written.** `docs/spec/04-categories.md`'s Testing Decisions call for `e2e/categories.e2e.ts`, but neither issue's acceptance criteria listed it and no ticket owns it — picked up by issue 03.

Decisions from the PR #5 review round that later issues inherit.

- **`COLOR_SWATCHES` is fourteen colours** (was ten): `Indigo`, `Turquoise`, `Ambre` and `Taupe` joined the palette so each of the twelve seeded categories gets a distinct one, with two spare. Values are Tailwind 500 shades and no existing swatch changed value or moved before index 0, so `DEFAULT_COLOR` and every account already coloured are unaffected. Seeds moved: Épargne / Investissement to `#14b8a6`, Impôts / Taxes to `#6366f1`. Tests must not hardcode a swatch hex — index into `COLOR_SWATCHES`, as `account-settings-modal.spec.ts` now does.
- **Accent-aware ordering is a shared collation, not a per-repository sort** — see the List order bullet above. Fixed for categories *and* accounts in the same change, since they had the identical `NOCASE` bug and the collation is registered centrally either way.

Decisions from issue 03 (E2E Postes tab) that later issues inherit.

- **`06-entries.md` inherits adding the blocked-with-count delete scenario to `e2e/categories.e2e.ts`** — it needs a category an entry actually references, and no entry-creation command or UI exists yet, so issue 03 covers only the usage-count-0 confirm-delete path.
