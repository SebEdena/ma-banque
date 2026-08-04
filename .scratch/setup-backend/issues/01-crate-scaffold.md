# 01 — Crate scaffold: Clean Architecture skeleton & tooling

**What to build:** A single Rust/Tauri crate exists and compiles, organized into the `domain/`, `usecases/`, `infra/`, `commands/` module layout described in `technical-architecture.md` §1.1. No business logic and no database wiring yet — this is the structural foundation every later ticket (and every future business-feature spec) builds on.

Scope, per `docs/spec/01-setup-backend.md`:

- `cargo tauri init` (or equivalent) produces the crate; no multi-crate workspace.
- Module skeleton: `domain/`, `usecases/`, `infra/`, `commands/`, each present (may be near-empty stubs).
- Dependencies added to `Cargo.toml`: `rusqlite`, `rusqlite_migration`, `thiserror`, `anyhow`, `serde` (with `derive`) — not wired to anything yet, just present and compiling.
- Module boundaries documented (what may depend on what: `commands → usecases → domain`, `infra → domain`) so future contributors don't introduce a dependency cycle or business logic in the wrong layer.
- `tauri.conf.json` established as the single source of truth for the app version.
- `cargo fmt --check` and `cargo clippy -- -D warnings` both pass clean.
- `cargo check` / `cargo build` succeed locally (target platform is Windows, but full CI cross-validation is out of scope here — covered by `02-setup-frontend-ci.md`).

Out of scope: any business entities (`Account`, `Category`, `Entry`, `RecurringRule`, `Reconciliation`), any SQLite connection/migration wiring (ticket 02), any Tauri command logic (ticket 03), the GitHub Actions pipeline itself (companion spec).

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `cargo tauri init`-based crate exists with `domain/`, `usecases/`, `infra/`, `commands/` modules
- [ ] `rusqlite`, `rusqlite_migration`, `thiserror`, `anyhow`, `serde` (derive) are added as dependencies and the crate compiles
- [ ] Module-boundary rules (`commands → usecases → domain`, `infra → domain`) are documented in the codebase (e.g. a module-level doc comment or README section)
- [ ] `tauri.conf.json` holds the app version as the documented single source of truth
- [ ] `cargo fmt --check` passes with no diff
- [ ] `cargo clippy -- -D warnings` passes with zero warnings
- [ ] `cargo check` and `cargo build` succeed locally
- [ ] No business entities or rules are present in the crate
