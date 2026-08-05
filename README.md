# Ma Banque

Une application de gestion bancaire simple.

## Development

### Backend (`src-tauri/`)

Single Rust crate, no workspace, organized in Clean Architecture layers. See
`docs/architecture/technical-architecture.md` §1 for the full rationale;
the allowed dependency directions (enforced by convention/review, not by
crate boundaries) are documented at the top of `src-tauri/src/lib.rs`:

- `domain/` — business entities, invariants, repository traits. Depends on nothing else in this crate.
- `usecases/` — orchestration of business rules. Depends on `domain` only.
- `infra/` — concrete implementations (SQLite, ...). Depends on `domain` only.
- `commands/` — Tauri entry points. Depends on `usecases` (and `infra`'s concrete types, to wire up state).

### Frontend (`src/`)

Angular 22 app, scaffolded with the framework's current defaults: zoneless
change detection, `OnPush` components, Vitest as the test runner. Runs as
the Tauri shell's webview (`npm start` for dev, `npm run build` for the
`frontendDist` consumed by `src-tauri/tauri.conf.json`). See
`docs/architecture/technical-architecture.md` §2 for the UI stack
(`spartan/ui` + Tailwind CSS, `@angular/aria`) and code style tooling
(`angular-eslint` + Prettier, Husky + lint-staged pre-commit hook).

### Local dev data

Debug builds (`cargo tauri dev`, and the `--debug` build the e2e suite runs
against) keep the data-folder pointer file and the default `saves/` folder
under `.dev-data/` at the repo root instead of the OS-standard user config/data
directories — local runs and e2e tests never touch (or get polluted by) a
real user profile. Delete `.dev-data/` to reset to a clean first-launch state.
Release builds (`cargo tauri build`) are unaffected and use the real OS
directories. See `src-tauri/src/lib.rs`'s `.setup()` hook.

### Versioning

`src-tauri/tauri.conf.json`'s `version` field is the single source of truth
for the app version. Bump it manually before tagging a release
(`vX.Y.Z`); the tag-triggered release workflow (see
`docs/spec/02-setup-frontend-ci.md`) builds from that value.
