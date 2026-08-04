# 03 — Data-file-location setting: end-to-end proof command

**What to build:** A developer (and, later, the Settings screen) can get and set the SQLite data file's location through a real Tauri command, exercising the full stack — `commands → usecases → infra → SQLite → back` — proving the Clean Architecture wiring from tickets 01/02 actually works before any business feature is built on top of it. This doubles as the first real backend piece of the future Settings screen (business requirements §4.5).

Scope, per `docs/spec/01-setup-backend.md`:

- A repository trait defined in `domain/` (e.g. something like `SettingsRepository` / `DataFileLocationRepository`) for reading/writing the data-file-location setting, with a concrete SQLite implementation in `infra/` — each instance holding its own clone of the shared `Arc<Mutex<Connection>>`, locking internally per call. Use cases depend on `&dyn Trait` (or a bounded generic), never on the connection directly.
- `thiserror`-based domain/use-case error enum(s), `#[derive(Serialize)]`, so Angular can branch on specific error variants.
- `anyhow` used for infra-layer failures (I/O, SQLite errors), converted to a single generic serializable error at the Tauri command boundary — no internal details leaked to the UI.
- Use cases for getting and setting the data-file location.
- Tauri commands exposing get/set, calling the use cases.
- Still no business entities (`Account`, `Category`, `Entry`, `RecurringRule`, `Reconciliation`).

**Blocked by:** ~~02 — Shared SQLite connection & migration runner~~ (done)

**Status:** ready-for-agent

- [ ] Domain repository trait for the data-file-location setting is defined in `domain/`
- [ ] Concrete SQLite implementation exists in `infra/`, holding its own clone of the shared `Arc<Mutex<Connection>>` and locking internally per call
- [ ] Domain/use-case errors are `thiserror` enums, `#[derive(Serialize)]`
- [ ] Infra errors use `anyhow`, converted to a single generic serializable error at the Tauri command boundary
- [ ] Use cases for get and set exist, depending on `&dyn Trait` (or bounded generic), not on the SQLite connection
- [ ] Tauri commands expose get/set and call the use cases
- [ ] Use-case unit tests run against a hand-written in-memory fake of the repository trait (no `mockall`)
- [ ] SQLite repository integration test runs against a fresh `:memory:` database with migrations applied
- [ ] The command path is proven end-to-end (`commands → usecases → infra → SQLite → back`) via a test exercising the use-case call path
- [ ] `cargo fmt --check`, `cargo clippy -- -D warnings`, and `cargo test` all pass locally
- [ ] No business entities or rules are introduced
