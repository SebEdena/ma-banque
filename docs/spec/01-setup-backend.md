# Spec — Backend Scaffolding (Rust / Tauri)

Complements [00-business-requirements.md](./00-business-requirements.md) and [technical-architecture.md](../architecture/technical-architecture.md) (architecture doc kept in French). Companion to [02-setup-frontend-ci.md](./02-setup-frontend-ci.md).

## Problem Statement

Before any business feature (accounts, categories, entries...) can be implemented, the project has no Rust/Tauri codebase at all: no crate, no layered architecture, no SQLite connection, no test pipeline. Without this foundation, every new business feature would have to improvise its own structure, leading to inconsistencies and slowing development down.

## Solution

Set up the Tauri/Rust backend skeleton in line with the architecture described in `technical-architecture.md`: a single Rust crate organized in Clean Architecture (`domain/`, `usecases/`, `infra/`, `commands/`), a shared SQLite connection with a migration system, differentiated error handling (`thiserror`/`anyhow`), and one working end-to-end Tauri command proving the layers are correctly wired — without implementing any business rule (no `Account`/`Category`/`Entry`/`RecurringRule`).

## User Stories

1. As a developer, I want a single Rust crate organized into `domain/`, `usecases/`, `infra/`, `commands/` modules, so that business logic added later has an unambiguous home and clear boundaries.
2. As a developer, I want a shared SQLite connection wrapped in `Arc<Mutex<Connection>>` exposed via `tauri::State`, so that every future repository can access the database without redefining connection management.
3. As a developer, I want a `rusqlite_migration`-based migration runner with embedded `.sql` files, so that schema changes are versioned and applied automatically on app startup.
4. As a developer, I want `thiserror`-based error enums defined in `domain`/`usecases`, serialized via `serde::Serialize`, so that business errors surface to Angular in a way that allows differentiated handling per case.
5. As a developer, I want `anyhow` used for infra-layer errors, converted to a generic error at the Tauri command boundary, so that technical failures are surfaced without leaking internal details to the UI.
6. As a developer, I want at least one repository trait defined in `domain/` with a concrete SQLite implementation in `infra/`, so that the pattern for future repositories (e.g. `AccountRepository`) is established and provably testable.
7. As a developer, I want a minimal end-to-end Tauri command that exercises `commands -> usecases -> infra -> SQLite` and back, so that the architecture is proven wired correctly before any business logic is added.
8. As a developer, I want use case tests written against hand-written in-memory fakes of repository traits, so that use case logic is testable without a database and without `mockall`.
9. As a developer, I want SQLite repository integration tests running against a fresh `:memory:` database per test, so that repository tests are isolated and fast.
10. As a developer, I want `cargo fmt --check` and `cargo clippy -- -D warnings` enforced, so that code style stays consistent from the very first commit.
11. As a developer, I want a mechanism to configure and persist the SQLite data file location, so that the app doesn't hardcode its database path and the future Settings screen has a real backend to build on.
12. As a developer, I want `tauri.conf.json` established as the single source of truth for the app version, so that release tagging follows a documented, unambiguous process.
13. As a developer, I want `cargo test` (unit + integration) passing locally, so that the scaffolding is provably solid before it's built on.
14. As a developer, I want the crate to compile via `cargo check`/`cargo build`, so that the target platform (Windows) is validated from day one.
15. As a developer, I want no business entities (`Account`, `Category`, `Entry`, `RecurringRule`, `Reconciliation`) implemented in this spec, so that scaffolding work stays decoupled from future feature specs and can be reviewed on its own merits.
16. As a developer, I want the module boundaries documented (what may depend on what: `commands` → `usecases` → `domain`, `infra` → `domain`), so that future contributors don't accidentally introduce a dependency cycle or business logic in the wrong layer.

## Implementation Decisions

- **Crate layout**: single crate (no multi-crate workspace), modules `domain/`, `usecases/`, `infra/`, `commands/`, per `technical-architecture.md` §1.1.
- **Error handling**: `thiserror` enums in `domain`/`usecases`, `#[derive(Serialize)]` so Angular can branch on error variants; `anyhow` in `infra`, converted to a single generic serializable error at the `commands` boundary.
- **Data access**: `rusqlite` (synchronous), no async runtime (no `tokio`). Connection shared via `Arc<Mutex<Connection>>` in Tauri-managed state — not an `r2d2` pool, since SQLite only supports one writer at a time.
- **Migrations**: `rusqlite_migration`, `.sql` files embedded via `include_str!`, applied automatically at startup.
- **Repository pattern**: traits declared in `domain/`, concrete SQLite structs in `infra/`, each holding its own clone of the shared `Arc<Mutex<Connection>>` and locking internally per call (avoids explicit lifetime parameters on traits/use cases). Use cases depend on `&dyn Trait` (or a bounded generic), never on the SQLite connection directly.
- **Vertical-slice proof command**: the one real end-to-end command built in this spec should be the data-file-location setting (get/set) — it's genuinely part of "app setup" rather than business logic, and it doubles as the first building block of the future Settings screen (business requirements §4.6) without pulling in the rest of that screen's scope.
- **Formatting/linting**: `cargo fmt`, `cargo clippy -- -D warnings` runnable locally; wiring into CI is covered by the companion spec (`02-setup-frontend-ci.md`), which owns the full pipeline since it depends on both sides existing.

## Testing Decisions

- A good test asserts observable behavior (e.g. "calling this command returns X", "after migration, this table/columns exist", "this use case, given this fake repository state, returns this result") — not internal implementation details of a layer.
- **Domain**: classic unit tests once any domain logic exists (none yet in this spec beyond scaffolding — kept minimal).
- **Use cases**: unit tests against hand-written in-memory fakes (`Vec`/`HashMap`-backed) implementing the repository traits — no `mockall`, per `technical-architecture.md` §1.5.
- **SQLite repositories**: integration tests against a fresh `:memory:` connection + migrations per test, full isolation.
- **The one vertical-slice command**: tested via its use case call path, proving `commands → usecases → infra → SQLite → back` end-to-end.
- No prior art exists in this greenfield codebase; follow the patterns already documented in `technical-architecture.md` §1.5.

## Out of Scope

- Any business entities or rules: `Account`, `Category`, `Entry`, `RecurringRule`, `Reconciliation`.
- The Angular frontend (covered in `02-setup-frontend-ci.md`).
- The GitHub Actions CI/CD pipeline itself (wired in the companion spec, which lands after both sides exist).
- macOS/Linux support.
- Application-level security (password/PIN lock, file encryption) — explicitly out of scope for v1 per the business requirements §2.6.

## Further Notes

- This spec is intentionally "boring" infrastructure so that later business-feature specs can each add one command/use case/repository at a time, following an already-established pattern instead of re-deciding architecture per feature.
- The companion frontend spec depends on this one landing first (or in parallel), since its own end-to-end proof story needs the data-file-location command to call.
