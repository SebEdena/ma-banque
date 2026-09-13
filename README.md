# Ma Banque

Une application de gestion bancaire simple.

## Environment setup

Prerequisites for `## Development` below.

**System packages** (Debian/Ubuntu, matches CI):

```sh
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

macOS: `xcode-select --install`. Windows: VS Build Tools ("Desktop
development with C++") + WebView2.

**Node** (24, via [nvm](https://github.com/nvm-sh/nvm)):

```sh
nvm install 24 && nvm use 24
```

**Rust** (stable; `src-tauri/Cargo.toml` requires >= 1.77.2):

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup component add rustfmt clippy
```

**Project deps** (also installs the Husky pre-commit hook via `prepare`):

```sh
npm install
```

**E2E only:**

```sh
cargo install tauri-driver
sudo apt-get install -y webkit2gtk-driver
```

`npm run tauri` (used below) resolves the `@tauri-apps/cli` devDependency
once `npm install` has run — no separate global install needed.

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

Debug builds (`npm run tauri dev`, and the `--debug` build the e2e suite
runs against) keep the data-folder pointer file and the default `saves/`
folder under `.dev-data/` at the repo root instead of the OS-standard user
config/data directories — local runs and e2e tests never touch (or get
polluted by) a real user profile. Delete `.dev-data/` to reset to a clean
first-launch state. Release builds (`npm run tauri build`) are unaffected
and use the real OS directories. See `src-tauri/src/lib.rs`'s `.setup()`
hook.

### Commands

All commands run from the repo root unless noted otherwise.

**Run the app locally (dev, hot-reload, dev-tools)**

```sh
npm run tauri dev
```

Starts Angular (`npm start`) and opens the Tauri window pointed at it, per
`beforeDevCommand` in `tauri.conf.json`. Uses `.dev-data/` for its data
folder (see above) — delete that folder to reset.

**Run just the Angular frontend, without Tauri (fast visual checks)**

```sh
npm run start:mock
```

Serves the Angular app alone in a plain browser tab (`ng serve --configuration
mock`) — no `cargo`/Tauri build needed, so it starts in seconds instead of
minutes. Outside a real Tauri webview, every Tauri call (`invoke()`, the
folder-picker dialog) has nothing to talk to; this configuration swaps
`AccountsApi`/`SettingsApi` for in-memory fakes (`InMemoryAccountsApi`,
`InMemorySettingsApi` in `src/app/core/mocks/`) via `src/app/app.config.ts`,
seeded with fixture accounts you can create/archive/unarchive/delete
interactively. It's for eyeballing a screen's layout/styling quickly, e.g.
against `docs/design/design.html` — it has no real persistence (state resets
on reload) and doesn't exercise the Rust backend at all, so it's not a
substitute for `npm run tauri dev` or the e2e suite when what you're
verifying is actual behavior rather than appearance. The mock code is
gated behind `src/environments/environment.ts`'s `mockBackend` flag and is
excluded entirely from `npm run build`'s production bundle (dead-code
eliminated, since only `environment.mock.ts`, swapped in via this
configuration's `fileReplacements`, sets it to `true`).

**Frontend tests / lint**

```sh
npm test              # Vitest, unit + component tests
npm run lint           # angular-eslint
npx tsc --noEmit       # type-check only
```

**Backend tests / lint**

```sh
cd src-tauri
cargo test             # unit + integration tests
cargo fmt               # format
cargo fmt --check       # format check only (what CI runs)
cargo clippy -- -D warnings
```

**End-to-end tests**

```sh
cargo install tauri-driver                       # once
sudo apt-get install -y webkit2gtk-driver         # once, Linux only
npm run tauri:build:debug                        # compiles the binary wdio drives
npm run e2e
```

**Debug build without the dev server** (matches what the e2e suite runs against)

```sh
npm run tauri:build:debug
```

Plain `cargo build`/`cargo run` still work for compiling the crate, but the
resulting binary tries to connect to `devUrl` (`localhost:4200`) instead of
loading a bundled frontend — use `npm run tauri:build:debug` or
`npm run tauri dev` instead when you need a working window.

**Pre-commit hooks**

Husky + lint-staged run automatically on `git commit` (formats/lints staged
`*.{ts,html,js,json,css,md}` files — Rust files are not covered, run
`cargo fmt`/`cargo clippy` yourself before committing backend changes). To
(re)install the hook after a fresh clone: `npm install` (runs the `prepare`
script). To run lint-staged manually against currently staged files:

```sh
npx lint-staged
```

### Versioning

`src-tauri/tauri.conf.json`'s `version` field is the single source of truth
for the app version. Run the **Bump version** workflow from the Actions tab
(`workflow_dispatch`, choosing `patch`/`minor`/`major`) to bump it — it syncs
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`/`Cargo.lock`, and
`package.json`/`package-lock.json`, commits to `main`, and pushes the
matching `vX.Y.Z` tag, which triggers the release workflow (see
`docs/spec/02-setup-frontend-ci.md`) to build from that value. The same run
regenerates `CHANGELOG.md` from conventional commit history via
[`git-cliff`](https://git-cliff.org) (config: `cliff.toml`).

### CI/CD

GitHub Actions runs on every push/PR (Rust fmt/clippy/test, `windows-latest`
compile check, Angular eslint/vitest/tsc), a Windows e2e job on PRs
targeting `main`, and a release workflow on `vX.Y.Z` tags. See
`docs/architecture/technical-architecture.md` §3 and
`.github/workflows/`.

Windows-only, and unsigned: the release workflow only builds on
`windows-latest`, and the installer isn't code-signed, so first launches
trip a SmartScreen "unknown publisher" warning. Both a macOS/Linux build
matrix and code signing need external resources (an Apple developer
account, a paid signing certificate) this project doesn't currently have —
known limitations, not oversights.
