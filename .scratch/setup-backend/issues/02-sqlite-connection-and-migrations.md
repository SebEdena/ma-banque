# 02 — Shared SQLite connection & migration runner

**What to build:** A shared SQLite connection is available to the whole app, and schema changes are versioned and applied automatically on startup. This is the data-access foundation every future repository (this spec's proof repository in ticket 03, and every business-feature repository afterward) will plug into — no repository has to invent its own connection or migration handling.

Scope, per `docs/spec/01-setup-backend.md`:

- A `rusqlite::Connection` is wrapped in `Arc<Mutex<Connection>>` and exposed via `tauri::State` — not an `r2d2` pool (SQLite only supports one writer at a time, per the architecture doc).
- A `rusqlite_migration`-based migration runner, with `.sql` migration files embedded via `include_str!`, applied automatically at app startup.
- At least one real migration file exists (even if minimal) so the runner has something to apply and verify — this can be the schema this spec's proof feature (ticket 03) needs, decided when that ticket starts.
- No business schema (`Account`, `Category`, `Entry`, `RecurringRule`, `Reconciliation` tables) — this ticket only proves the migration mechanism works.

**Blocked by:** 01 — Crate scaffold: Clean Architecture skeleton & tooling

**Status:** ready-for-agent

- [ ] Shared connection is wrapped in `Arc<Mutex<Connection>>` and managed as `tauri::State`
- [ ] `rusqlite_migration` runner is wired with `.sql` files embedded via `include_str!`
- [ ] Migrations run automatically on app startup
- [ ] An integration test spins up a fresh `:memory:` database, runs the migrations, and asserts the expected schema/table(s) exist
- [ ] `cargo fmt --check` and `cargo clippy -- -D warnings` still pass
- [ ] `cargo test` passes locally
