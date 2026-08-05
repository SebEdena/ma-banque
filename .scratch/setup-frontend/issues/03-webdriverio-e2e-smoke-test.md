# 03 — WebdriverIO e2e smoke test

**What to build:** At least one true end-to-end test runs against the actually-compiled Tauri app and asserts the shell renders, proving the app launches outside of unit/component test doubles.

Scope, per `docs/spec/02-setup-frontend-ci.md`:

- WebdriverIO + `@wdio/tauri-service` (driving `tauri-driver`) configured for e2e tests.
- At least one smoke test: app launches, shell (routing skeleton) renders.

Out of scope: the CI job that runs this suite on PRs (ticket 05), any business-screen e2e coverage.

**Blocked by:** 02 — Theme detection & routing skeleton

**Status:** ready-for-agent

- [ ] WebdriverIO is configured with `@wdio/tauri-service`
- [ ] A smoke test launches the compiled app and asserts the shell renders
- [ ] The e2e suite runs locally against a real build
