# 03 — WebdriverIO e2e smoke test

**What to build:** At least one true end-to-end test runs against the actually-compiled Tauri app and asserts the shell renders, proving the app launches outside of unit/component test doubles.

Scope, per `docs/spec/02-setup-frontend-ci.md`:

- WebdriverIO + `@wdio/tauri-service` (driving `tauri-driver`) configured for e2e tests.
- At least one smoke test: app launches, shell (routing skeleton) renders.

Out of scope: the CI job that runs this suite on PRs (ticket 05), any business-screen e2e coverage.

**Blocked by:** 02 — Theme detection & routing skeleton

**Status:** done — validated via `/code-review` (Standards + Spec axes) against `f7662b3...HEAD`

- [x] WebdriverIO is configured with `@wdio/tauri-service`
- [x] A smoke test launches the compiled app and asserts the shell renders
- [x] The e2e suite runs locally against a real build

**Implementation notes:**

- `wdio.conf.ts` uses `driverProvider: 'external'`, driving a separately-installed `tauri-driver` binary (`cargo install tauri-driver`) plus the system `webkit2gtk-driver` package — matches the ticket's "driving `tauri-driver`" wording. The alternative `embedded` provider needs a Tauri Rust plugin baked into the app binary and wasn't pursued.
- The compiled binary must be produced via `cargo tauri build --debug --no-bundle` (not plain `cargo build`), since a plain debug build always tries to connect to `devUrl` (`localhost:4200`) instead of loading the bundled `frontendDist`.
- `e2e/smoke.e2e.ts` asserts the `router-outlet` renders and the default `home` route's placeholder text ("Accueil") is present.
- Local prerequisites for running `npm run e2e`: `cargo install tauri-driver`, `sudo apt-get install -y webkit2gtk-driver` (Linux only), and a debug build via `cargo tauri build --debug --no-bundle`.
- CI wiring intentionally deferred to ticket 05.
