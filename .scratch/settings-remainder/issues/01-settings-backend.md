# 01 — Settings backend: `settings` table + display-settings use cases

**What to build:** A developer (and later the Settings screen) can read and update the app's date/currency display preferences through real Tauri commands, following the same Clean Architecture layering as the data-folder-location feature.

Scope, per `docs/spec/05-settings-remainder.md`:

- The `settings` table already exists (created by an earlier migration as a key/value store) but is empty — this ticket adds a migration inserting the default rows (`date_format=DMY`, `currency_format=SYMBOL_AFTER`, matching the prototype's pre-selected options) and treats the two keys as enum-like string values (`date_format` ∈ `{DMY, YMD, MDY}`, `currency_format` ∈ `{SYMBOL_AFTER, SYMBOL_BEFORE, ISO_CODE}`), not freeform pattern strings.
- New modules, mirroring the `data_folder_location` feature's layout: `domain::settings` (`DisplaySettings`, `SettingsError` if any), `usecases::settings` (`get_display_settings`, `update_display_settings`), `infra::settings` (`SqliteSettingsRepository`), `commands::settings` (Tauri commands calling the use cases).
- No changes to `commands::data_folder_location` or its backing modules — this ticket only adds the new settings feature alongside it.
- Theme is explicitly **not** part of this table — it stays a frontend-only preference, built in ticket 02.

Out of scope: any Settings screen UI (ticket 02), the first-launch/unreachable-folder prompt (ticket 03), the folder move/open actions (ticket 04, already implemented by `01-setup-backend.md`).

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `settings` table has a default row (or default key/value rows) present on a fresh database, inserted via a migration
- [ ] `domain::settings` defines `DisplaySettings` (date/currency format as enum-like values) and any needed error type
- [ ] `usecases::settings` exposes `get_display_settings` and `update_display_settings`, tested against a hand-written in-memory fake repository (no `mockall`)
- [ ] `infra::settings::SqliteSettingsRepository` implements the domain repository trait against SQLite
- [ ] `commands::settings` exposes Tauri commands for get/update, calling the use cases
- [ ] SQLite integration tests: default row present on a fresh database, update persists and is re-readable
- [ ] `cargo fmt --check`, `cargo clippy -- -D warnings`, and `cargo test` all pass locally
- [ ] No business entities or unrelated modules are touched
