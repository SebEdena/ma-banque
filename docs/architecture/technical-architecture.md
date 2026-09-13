# Detailed Technical Architecture — Ma Banque

Complements the [business requirements](../spec/00-business-requirements.md) (original French version: [00-business-requirements.fr.md](../spec/00-business-requirements.fr.md)), which remains the functional reference. This document details the technical choices (stack, tests, CI/CD) that came out of an architecture review session. Original French version: [technical-architecture.fr.md](./technical-architecture.fr.md).

**Cross-cutting convention**: the source code (identifiers, comments, table names) is entirely **in English**, while the shipped application UI (all on-screen labels, button text, messages) is entirely **in French**, using the domain terms from the original business requirements. See the translation glossary at the end of this document for the FR (UI) → EN (code) mapping.

---

## 1. Rust (Tauri backend)

### 1.1 Code organization

A single Rust crate (no multi-crate workspace), organized into modules reflecting Clean Architecture:

- `domain/` — business entities and invariant rules
- `usecases/` — orchestration of business rules
- `infra/` — concrete implementations (SQLite)
- `commands/` — Tauri entry points, call the use cases

A multi-crate workspace would give a stricter compilation boundary, but adds friction (build time, cross-crate imports) disproportionate for a single-user v1 of this size. Modules + code review are enough to enforce the boundaries.

### 1.2 Error handling

- **`thiserror`** for business errors (domain/use cases): explicit enums (e.g. `AccountError::HasEntries`), serialized via `serde::Serialize` to surface cleanly to Angular and allow differentiated display per case.
- **`anyhow`** for technical errors in the infrastructure layer (I/O, SQLite), converted to a generic error at the Tauri command level.

### 1.3 Monetary amounts

All amounts (`opening_balance`, entry `amount`, statement `bank_balance`, and any derived sum) are stored and computed **internally as `i64` minor units (cents)**, never `f64`/SQLite `REAL`. Repeated float addition across many entries would silently drift by fractions of a cent — unacceptable for a ledger balance; all storage, sums, and comparisons happen in integer cents.

The float ↔ cents conversion, in **both directions**, is a calculation, and per business requirements' "Rust owns all business logic ... calculations", it stays entirely in Rust — Angular never multiplies, divides, or rounds an amount itself. Each Tauri command that returns an amount divides once, at the boundary — `cents as f64 / 100.0` — right before serializing, so the wire value (e.g. `1234.56`) is already correct; Angular receives a plain number and only reformats it for presentation (symbol position, thousands/decimal separators per `currency_format`, `05-settings-remainder.md`). Each Tauri command that accepts an amount as input takes the raw major-unit `f64` exactly as the user typed it (e.g. from the opening-balance field) and does the `f64 → cents` conversion itself — `(value * 100.0).round() as i64` — plus any resulting validation (e.g. rejecting a value that doesn't round cleanly to cents), before that value ever touches domain logic or storage. Angular's only job on the input side is passing the typed number through unmodified; it must not pre-round or pre-multiply it into cents itself, since that would silently duplicate Rust's rounding decision at a second, unsynchronized site. This applies uniformly from `03-accounts.md` onward — every spec introducing a monetary column follows this rule without restating it.

### 1.4 Data access

- **`rusqlite`** (synchronous), not `sqlx` (async) nor `tauri-plugin-sql` (the latter is designed to be driven from JS, which would break the "no direct SQLite access from Angular" rule).
- No async runtime: the app is single-user, with no concurrent load justifying `tokio`. Tauri already runs each command on a thread pool.
- **Migrations**: `rusqlite_migration`, versioned `.sql` files embedded via `include_str!`.
- **Concurrency**: the connection is shared via **`Arc<Mutex<Connection>>`** in Tauri-managed state (`tauri::State`) — no `r2d2` pool. SQLite only allows one writer at a time; a pool would bring no value here.

### 1.5 Repositories

- Defined as **traits** in the domain (e.g. `trait AccountRepository`), concrete SQLite implementations in `infra/`.
- Each concrete implementation holds an `Arc<Mutex<Connection>>` (cloned from Tauri state), and locks internally on each method call. This avoids any explicit lifetime parameter on traits or use cases — a classic Rust trap for this kind of architecture.
- Use cases take `&dyn AccountRepository` (or a bounded generic), without ever knowing the SQLite connection exists.

### 1.6 Tests

| Level               | Approach                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use cases           | Hand-written **in-memory fakes** (repository trait implementations backed by `Vec`/`HashMap`), not `mockall` — more refactor-resilient, more readable for a dev new to Rust. |
| SQLite repositories | Integration tests against an **`:memory:`** database, fresh connection + migrations for each test (full isolation, fast).                                                    |
| Domain              | Classic unit tests (calculation rules, validations).                                                                                                                         |

### 1.7 Local dev data

In debug builds (`npm run tauri dev`, and the `--debug` build the e2e suite
runs against), the data-folder pointer file and the default `saves/` folder
are kept under `.dev-data/` at the repo root instead of the OS-standard
config/data directories — local runs and e2e tests never touch (or get
polluted by) a real user profile. Deleting `.dev-data/` resets to a clean
first-launch state. Release builds (`npm run tauri build`) are unaffected and
use the real OS directories.

---

## 2. Angular (frontend)

### 2.1 UI components / styling

- **Angular 22** (stable since June 2026, active support until December 2026 / LTS until May 2028) as the project's target version.
- **`spartan/ui`** (Brain + Helm architecture, on top of Angular CDK + Tailwind CSS) as the primary base: covers most needs (modal, dropdown, date picker, select, toast) with a customizable "rounded/SaaS" starting point.
- **`@angular/aria`** (headless, stable since v22) as a complement for any custom pattern not covered by spartan (e.g. the reconciliation indicator's behavior).
- Dark mode handled natively via Tailwind (`dark:`), consistent with the light/dark/system requirement.
- **Zoneless change detection by default** (no `zone.js` dependency), components in `OnPush` — `ng new`'s default behavior in v22, not an opt-in choice for the project.

### 2.2 Error display

- **Action/command errors** (a `thiserror` enum variant rejected from an `invoke()` call — e.g. "account has entries", "destination folder occupied") surface as a **dismissible toast**, via `spartan/ui`'s toast component (already the chosen kit, §2.1), using the enum's message text verbatim so each case reads as the precise, differentiated message it was designed to be (§1.2).
- **Field-level validation** (e.g. empty name, invalid amount) is **inline** next to the offending field, not a toast — it must persist while the user corrects the field, which a transient toast can't do.
- This is the default pattern for every spec from `03-accounts.md` onward; a spec only needs to call out error display if it deviates from this split.

### 2.3 Tests

- **Vitest** for unit and component tests (default runner scaffolded by `ng new` since Angular 22, Karma/Jasmine fully removed).
- **E2E**: WebdriverIO + `@wdio/tauri-service` (drives `tauri-driver`), run on `windows-latest` only (see §3).
- **Every spec that adds a new business-facing flow (create/edit/delete-style screens, not just a new route) extends the e2e suite** with a scenario covering that flow's `data-testid` hooks — the shell smoke test proves the app launches, not that a feature works end to end. A spec's "Testing Decisions" section may only skip this when the spec adds no new user-facing flow (e.g. a schema-only or infra-only change). New spec files each get their own `e2e/*.e2e.ts`, sharing one WDIO session via `wdio.conf.ts`'s spec grouping — see `e2e/support/routed-shell.ts`'s `ensureRoutedShell()` for how a file picks up from wherever an earlier one in the session left off, instead of assuming a fresh launch.

### 2.4 Code style

- `angular-eslint` + `Prettier`.
- Pre-commit hook (Husky + lint-staged) to auto-format/lint modified files before each commit.

---

## 3. CI/CD

**v1 target platform: Windows only** (macOS/Linux deferred to a future evolution — see business requirements §1 and §7).

Hosting: GitHub Actions (repo on GitHub).

### 3.1 On every push / PR

Jobs blocking for merge to `main`:

- Rust: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` (unit + integration)
- Angular: `eslint`, Vitest tests, `tsc --noEmit`
- Compilation: `cargo check` / `cargo build` on `windows-latest` (no full installer build at this stage)
- Rust cache: `Swatinem/rust-cache`

E2E tests (WebdriverIO) run separately — on PRs to `main`, not on every push (slower, need the compiled app).

### 3.2 On tag `vX.Y.Z`

Dedicated workflow using **`tauri-apps/tauri-action`** on `windows-latest`:

- Build + bundle the installer (`.msi`/`.exe`)
- Create a draft GitHub Release with the installer as an asset
- No signing/notarization in v1 (personal app, not mass-distributed — an "unrecognized publisher" warning is acceptable)
- Version source of truth: `tauri.conf.json`, bumped by the manually-triggered `bump-version.yml` workflow (`patch`/`minor`/`major` choice), which syncs `Cargo.toml`/`Cargo.lock` and `package.json`/`package-lock.json`, regenerates `CHANGELOG.md` from conventional commits via `git-cliff` (config: `cliff.toml`), commits to `main`, and pushes the `vX.Y.Z` tag that triggers this release workflow

---

## 4. Translation glossary (FR → EN)

The shipped application UI uses the French terms from the business requirements as-is (Compte, Poste, Écriture, Pointage...) — no translation needed there. This table only maps those French domain terms to the English identifiers used in source code (variables, tables, comments).

| FR (UI & business requirements) | EN (code identifiers only) |
| ------------------------------- | -------------------------- |
| Compte                          | `Account`                  |
| Poste                           | `Category`                 |
| Écriture                        | `Entry`                    |
| Règle de périodicité            | `RecurringRule`            |
| Pointage                        | `Reconciliation`           |
| solde_pointe                    | `reconciled_balance`       |
| solde_banque                    | `bank_balance`             |
| date_arret                      | `statement_date`           |
| est_systeme                     | `is_system`                |
