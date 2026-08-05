# 05 — CI/CD pipeline (push/PR, e2e, release)

**What to build:** GitHub Actions automatically validates every change on both sides of the stack and produces a bundled installer on release tags, per `technical-architecture.md` §3 — so nothing merges into `main` broken, and shipping a version doesn't require a manual build step.

Scope, per `docs/spec/02-setup-frontend-ci.md`:

- **Push/PR workflow** (blocking for merge to `main`): `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `eslint`, Vitest, `tsc --noEmit` on every push/PR; `cargo check`/`cargo build` also validated on `windows-latest` in the same workflow; Rust build caching via `Swatinem/rust-cache`.
- **E2E workflow**: runs the WebdriverIO suite (ticket 03) as a separate, slower job, triggered only on PRs targeting `main` — not on every push.
- **Release workflow**: triggered on `vX.Y.Z` tags, uses `tauri-apps/tauri-action` on `windows-latest` to build/bundle the installer and create a draft GitHub Release with the installer as an asset. No code signing/notarization in v1. `tauri.conf.json` remains the version source of truth, bumped manually before tagging.

Out of scope: code signing/notarization, macOS/Linux builds (v1 targets Windows only), any business-feature test content beyond what tickets 01–04 already produced.

**Blocked by:** 01 — Angular scaffold, UI stack & code-style tooling; 03 — WebdriverIO e2e smoke test

**Status:** ready-for-agent

- [ ] Push/PR workflow runs `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `eslint`, Vitest, and `tsc --noEmit` on every push/PR
- [ ] The same workflow validates `cargo check`/`cargo build` on `windows-latest`
- [ ] Rust build caching (`Swatinem/rust-cache`) is configured
- [ ] The push/PR workflow blocks merge to `main` on failure
- [ ] A separate e2e workflow runs the WebdriverIO suite, triggered only on PRs targeting `main`
- [ ] A release workflow triggers on `vX.Y.Z` tags, uses `tauri-apps/tauri-action` on `windows-latest`
- [ ] The release workflow produces a bundled installer and a draft GitHub Release with the installer attached
- [ ] No code signing/notarization or non-Windows build targets are introduced
