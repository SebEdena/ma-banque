# 05 — CI/CD pipeline (push/PR, e2e, release)

**What to build:** GitHub Actions automatically validates every change on both sides of the stack and produces a bundled installer on release tags, per `technical-architecture.md` §3 — so nothing merges into `main` broken, and shipping a version doesn't require a manual build step.

Scope, per `docs/spec/02-setup-frontend-ci.md`:

- **Push/PR workflow** (blocking for merge to `main`): `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `eslint`, Vitest, `tsc --noEmit` on every push/PR; `cargo check`/`cargo build` also validated on `windows-latest` in the same workflow; Rust build caching via `Swatinem/rust-cache`.
- **E2E workflow**: runs the WebdriverIO suite (ticket 03) as a separate, slower job, triggered only on PRs targeting `main` — not on every push.
- **Release workflow**: triggered on `vX.Y.Z` tags, uses `tauri-apps/tauri-action` on `windows-latest` to build/bundle the installer and create a draft GitHub Release with the installer as an asset. No code signing/notarization in v1. `tauri.conf.json` remains the version source of truth, bumped manually before tagging.

Out of scope: code signing/notarization, macOS/Linux builds (v1 targets Windows only), any business-feature test content beyond what tickets 01–04 already produced.

**Blocked by:** ~~01 — Angular scaffold, UI stack & code-style tooling~~ (done); ~~03 — WebdriverIO e2e smoke test~~ (done)

**Status:** done, minus one action outside this repo (see note below)

- [x] Push/PR workflow runs `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `eslint`, Vitest, and `tsc --noEmit` on every push/PR
- [x] The same workflow validates `cargo check`/`cargo build` on `windows-latest`
- [x] Rust build caching (`Swatinem/rust-cache`) is configured
- [ ] The push/PR workflow blocks merge to `main` on failure — the workflow itself reports pass/fail per job; actually **requiring** those checks is a GitHub branch-protection setting on the repo (`gh api repos/SebEdena/ma-banque/branches/main/protection`), which changes shared repo config and wasn't applied without confirmation. Needs a deliberate follow-up action.
- [x] A separate e2e workflow runs the WebdriverIO suite, triggered only on PRs targeting `main`
- [x] A release workflow triggers on `vX.Y.Z` tags, uses `tauri-apps/tauri-action` on `windows-latest`
- [x] The release workflow produces a bundled installer and a draft GitHub Release with the installer attached
- [x] No code signing/notarization or non-Windows build targets are introduced

**Implementation notes:**

- `.github/workflows/ci.yml` — three parallel jobs: `rust-checks` (`ubuntu-latest`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`), `rust-windows-build` (`windows-latest`: `cargo check`, `cargo build`), `frontend-checks` (`ubuntu-latest`: `eslint`, Vitest, `tsc --noEmit`). Triggers on push to `main` and on every PR. `rust-checks` needs Tauri's Linux build prerequisites (`libwebkit2gtk-4.1-dev` and friends, per the official Tauri v2 prerequisites doc) installed via `apt-get` before `cargo` runs, since `tauri`'s build script needs them even just to `clippy`/`test` — not only to produce a GUI binary.
- `.github/workflows/e2e.yml` — `windows-latest` only (per `technical-architecture.md` §2.2/§3), triggered on PRs targeting `main`. Installs `tauri-cli` and `tauri-driver` via `cargo install`, plus `msedgedriver-tool` (a Windows-only prerequisite `tauri-driver` needs to match the runner's WebView2/Edge version — not needed on the Linux dev-machine path documented in the README, which uses `webkit2gtk-driver` instead), builds via `cargo tauri build --debug --no-bundle`, then `npm run e2e`.
- `.github/workflows/release.yml` — triggered on `vX.Y.Z` tags, `windows-latest`, installs `tauri-cli` then runs `tauri-apps/tauri-action@v1` with `projectPath: src-tauri` (this repo's Tauri project isn't at the repo root) to build, bundle, and create a draft GitHub Release. `tauri.conf.json`'s `version` stays the source of truth, as decided in the spec — the workflow doesn't derive or bump it.
- Fixed a pre-existing `cargo fmt` violation in `src-tauri/src/lib.rs` (line wrap) while wiring this up — otherwise the new `rust-checks` job would fail on `main` from its very first run, for a change unrelated to this ticket.
- The "blocks merge on failure" checklist item needs a branch-protection rule (required status checks) added on GitHub itself, which is a shared/external change outside version control — flagged above rather than applied silently.
