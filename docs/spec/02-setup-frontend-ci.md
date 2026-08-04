# Spec — Frontend Scaffolding (Angular) & CI/CD Pipeline

Complements [00-business-requirements.md](./00-business-requirements.md) and [technical-architecture.md](../architecture/technical-architecture.md) (architecture doc kept in French). Companion to [01-setup-backend.md](./01-setup-backend.md) — depends on it for the Tauri command used as the wiring proof.

## Problem Statement

There is no Angular application yet: no Tauri shell, no styling system, no theme handling, and no automated pipeline validating that changes on both sides of the stack keep working together. Without this, no screen can be built, and nothing protects `main` from regressions.

## Solution

Set up the Angular frontend as a pure presentation shell (`spartan/ui` + Tailwind, light/dark/system theme, routing skeleton, empty home screen) that calls a real Tauri command from the backend scaffold to prove the two sides are correctly wired, and set up the GitHub Actions pipeline (lint/test/build gates on every push/PR, tag-triggered release build) described in `technical-architecture.md` §3.

## User Stories

1. As a developer, I want an Angular 22 project scaffolded inside the Tauri shell, so that frontend work can begin on the current stable release.
2. As a developer, I want `spartan/ui` (Brain + Helm) and Tailwind CSS installed and configured, so that future screens share a consistent "rounded/SaaS" component base.
3. As a developer, I want `@angular/aria` (stable as of v22) available for custom headless patterns not covered by spartan, so that bespoke interactions (e.g. the future reconciliation indicator) have an accessible foundation to build on.
4. As a user, I want the app to detect my system's light/dark preference on first launch, so that it matches my OS without any extra configuration.
5. As a developer, I want the theme mechanism (service/signal) established now, so that a future Settings screen only needs to add a manual override UI, not the underlying plumbing.
6. As a developer, I want a routing skeleton with placeholder routes for the screens named in the business requirements (home, account, categories, stats, settings), so that future feature specs have a place to attach their screens without deciding routing structure each time.
7. As a developer, I want an empty home screen that calls one real Tauri command from the backend scaffold, so that the frontend-backend wiring is proven end-to-end before any business feature exists.
8. As a developer, I want Vitest configured for unit and component tests, so that frontend logic is testable from the very first component onward.
9. As a developer, I want WebdriverIO + `@wdio/tauri-service` configured for e2e tests, so that at least one smoke test (app launches, shell renders) runs against the actually-compiled app.
10. As a developer, I want `angular-eslint` and Prettier configured, so that frontend code style is enforced automatically rather than by convention alone.
11. As a developer, I want a pre-commit hook (Husky + lint-staged) that formats/lints staged files, so that style issues are caught before they ever reach a commit.
12. As a developer, I want a GitHub Actions workflow running `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `eslint`, Vitest, and `tsc --noEmit` on every push/PR, so that regressions on either side of the stack are blocked from merging into `main`.
13. As a developer, I want `cargo check`/`cargo build` validated on `windows-latest` in that same workflow, so that the target platform compiles on every change, not just at release time.
14. As a developer, I want Rust build caching (`Swatinem/rust-cache`) in CI, so that pipeline runs stay fast as the crate grows.
15. As a developer, I want e2e tests running as a separate, slower job triggered only on PRs targeting `main`, so that fast feedback on every push isn't blocked by the heavier e2e suite.
16. As a developer, I want a separate tag-triggered (`vX.Y.Z`) workflow using `tauri-apps/tauri-action` on `windows-latest`, so that pushing a version tag automatically produces a bundled installer and a draft GitHub Release.
17. As a developer, I want no business screens (accounts, categories, entries, statistics) implemented in this spec, so that scaffolding stays decoupled from future feature specs and can be reviewed on its own merits.
18. As a developer, I want the project scaffolded with Angular 22's new defaults (zoneless change detection, `OnPush` components, Vitest as the built-in test runner) rather than opted-in manually, so that the codebase starts on the framework's current idiomatic baseline instead of accumulating migration debt later.

## Implementation Decisions

- **Angular version**: v22 (current stable as of this spec, released June 2026, active support through December 2026 / LTS through May 2028) — confirmed via the official Angular v22 announcement and release notes, not assumed from prior specs referencing "Angular 21+".
- **UI stack**: `spartan/ui` (Brain + Helm architecture) on Angular CDK + Tailwind CSS as the primary component base; `@angular/aria` (now stable in v22, previously a developer-preview package under "Angular 21+") for custom headless patterns spartan doesn't cover.
- **Change detection**: zoneless by default (no `zone.js` dependency), components authored with `OnPush` — this is v22's default for new projects via `ng new`, not an opt-in choice made for this project. Component/service code should lean on signals rather than manual `markForCheck`/`detectChanges` calls.
- **Theming**: Tailwind's `dark:` variant; system preference detected via `prefers-color-scheme` on first launch. The service/signal exposing "current theme" is built now; the manual override *UI* itself belongs to the future Settings screen (out of scope here) but the mechanism it will call is established in this spec.
- **Routing**: a skeleton with placeholder routes for home, account, categories, stats, and settings, per the business requirements §4. Placeholder routes may render empty/"coming soon" content — no business logic behind them.
- **Vertical-slice proof**: the home screen invokes the data-file-location command built in `01-setup-backend.md`, rendering the returned value as plain text. This is the single proof that `invoke()` plumbing works end-to-end; it is not a real feature and should be replaced once the account-list home screen (business requirements §4.1) is built.
- **Testing tools**: Vitest for unit/component tests — the default test runner scaffolded by `ng new` as of Angular 22 (Karma/Jasmine fully retired, no longer just an opt-in replacement); WebdriverIO + `@wdio/tauri-service` (driving `tauri-driver`) for e2e, `windows-latest` only per v1 platform scope. Zoneless change detection means component tests should assert on signal/DOM state directly rather than relying on `fakeAsync`/`tick` patterns written for zone-based apps.
- **Code style**: `angular-eslint` + Prettier; Husky + lint-staged pre-commit hook auto-formats/lints modified files.
- **Selectorless components**: not adopted for this scaffold — it's a new, optional v22 authoring style (importing components directly in templates without a selector string). Worth revisiting once the team has hands-on experience with it, but not a scaffolding-time requirement.
- **CI/CD (GitHub Actions)**, per `technical-architecture.md` §3:
  - *Push/PR workflow* (blocking for merge to `main`): `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `eslint`, Vitest, `tsc --noEmit`, and `cargo check`/`cargo build` on `windows-latest`. Rust build caching via `Swatinem/rust-cache`.
  - *E2E workflow*: WebdriverIO suite, triggered on PRs targeting `main` only — not on every push, since it needs the compiled app and is slower.
  - *Release workflow*: triggered on `vX.Y.Z` tags, uses `tauri-apps/tauri-action` on `windows-latest` to build and bundle the installer (`.msi`/`.exe`) and create a draft GitHub Release with the installer as an asset. No code signing/notarization in v1. `tauri.conf.json` remains the version source of truth, bumped manually before tagging.

## Testing Decisions

- A good test asserts observable behavior: the theme class applied to the DOM under a given system preference, a placeholder route rendering its expected content, the home screen displaying the value returned by the (mocked) Tauri command — not a component's internal wiring.
- **Modules tested**: theme detection service (unit), routing shell (component tests per route), home screen's `invoke()` call (component test with a mocked Tauri API), plus at least one true e2e smoke test that launches the compiled app and asserts the shell renders.
- No prior art exists in this greenfield codebase; Vitest is the default test runner per `technical-architecture.md` §2.2 (see version note above — Karma/Jasmine are fully retired as of Angular 22, not merely deprecated). The CI workflow structure follows `technical-architecture.md` §3 directly.

## Out of Scope

- Any business screens or logic: accounts, categories, entries, recurring rules, reconciliation, statistics (business requirements §4.1–4.5, §7).
- The full Settings screen — only the theme-detection mechanism and the plumbing to read the one backend setting are established here.
- Code signing / notarization of the installer.
- macOS/Linux builds (v1 targets Windows only).

## Further Notes

- This spec depends on `01-setup-backend.md` landing first (or in parallel), since the home screen's end-to-end proof story needs a real Tauri command to call.
- The CI/CD pipeline is owned by this spec rather than the backend one because it validates both sides together and can't meaningfully be split without duplicating workflow definitions.
- Once both scaffolding specs merge, subsequent feature specs (e.g. "Accounts CRUD") can each add one screen/use case/repository at a time without re-deciding tooling, theming, or pipeline structure.
