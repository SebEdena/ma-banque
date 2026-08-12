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
- **List order** is `ORDER BY name COLLATE NOCASE, id`, applied in the repository, so `list_categories` is already sorted and the UI should not re-sort. Caveat: SQLite's `NOCASE` only folds ASCII, so an accented initial sorts after every unaccented one — "Épargne / Investissement" comes last, after "Transport". `infra::account::list` has the same behaviour; fixing both needs a custom collation and is deliberately not done here.
- **`entries.category_id` now has a real foreign key** to `categories(id)`, added by rebuilding the `entries` table in migration 0005 (0004 created the column without the constraint because `categories` didn't exist yet). Deleting a category that entries reference fails at the database level as well as via the `InUse` guard.
- **`EntryRepository` gained `count_by_category(category_id)`** — `06-entries.md` inherits it.
