# 02 — Shared SQLite connection & migration runner

**What to build:** A shared SQLite connection is available to the whole app, and schema changes are versioned and applied automatically on startup. This is the data-access foundation every future repository (this spec's proof repository in ticket 03, and every business-feature repository afterward) will plug into — no repository has to invent its own connection or migration handling.

Scope, per `docs/spec/01-setup-backend.md`:

- A `rusqlite::Connection` is wrapped in `Arc<Mutex<Connection>>` and exposed via `tauri::State` — not an `r2d2` pool (SQLite only supports one writer at a time, per the architecture doc).
- A `rusqlite_migration`-based migration runner, with `.sql` migration files embedded via `include_str!`, applied automatically at app startup.
- At least one real migration file exists (even if minimal) so the runner has something to apply and verify — this can be the schema this spec's proof feature (ticket 03) needs, decided when that ticket starts.
- No business schema (`Account`, `Category`, `Entry`, `RecurringRule`, `Reconciliation` tables) — this ticket only proves the migration mechanism works.

**Blocked by:** ~~01 — Crate scaffold: Clean Architecture skeleton & tooling~~ (done)

**Status:** done

- [x] Shared connection is wrapped in `Arc<Mutex<Connection>>` and managed as `tauri::State`
- [x] `rusqlite_migration` runner is wired with `.sql` files embedded via `include_str!`
- [x] Migrations run automatically on app startup
- [x] An integration test spins up a fresh `:memory:` database, runs the migrations, and asserts the expected schema/table(s) exist
- [x] `cargo fmt --check` and `cargo clippy -- -D warnings` still pass
- [x] `cargo test` passes locally

**Implementation notes:**
- First real migration (`migrations/0001_create_settings.sql`) creates a `settings` key/value table — the schema ticket 03's data-file-location setting needs, per the spec's "decided when that ticket starts" note.
- Startup connection lives at `{app_data_dir}/ma-banque.sqlite`, opened and migrated in `lib.rs`'s `.setup()` hook, then `app.manage()`d as `tauri::State<SharedConnection>`.

**Amendment (2026-08-05):** business requirements §2.3.1 and `01-setup-backend.md` now require the connection path to come from ticket 03's folder pointer (not a hardcoded `{app_data_dir}/ma-banque.sqlite`), plus pre-migration backups and a downgrade guard. That follow-up work is scoped separately in ticket `04-migration-backup-and-downgrade-guard.md` rather than reopening this ticket's original (still valid) scope.
