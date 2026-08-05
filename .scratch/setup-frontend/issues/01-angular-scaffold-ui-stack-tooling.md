# 01 — Angular scaffold, UI stack & code-style tooling

**What to build:** An Angular 22 application exists inside the Tauri shell, using the framework's current idiomatic defaults (zoneless change detection, `OnPush` components, Vitest as the built-in test runner), with `spartan/ui` (Brain + Helm) + Tailwind CSS as the component base and `@angular/aria` available for bespoke headless patterns. Code style is enforced automatically via `angular-eslint`, Prettier, and a Husky + lint-staged pre-commit hook. No theme mechanism, routing, or business screen yet — this is the foundation every later frontend ticket builds on.

Scope, per `docs/spec/02-setup-frontend-ci.md`:

- Angular 22 project scaffolded (`ng new` or equivalent) inside the existing Tauri shell, using v22's new defaults (zoneless, `OnPush`, Vitest) rather than opted-in manually.
- `spartan/ui` (Brain + Helm) installed and configured on Angular CDK + Tailwind CSS.
- `@angular/aria` installed and available (not necessarily used yet).
- `angular-eslint` + Prettier configured.
- Husky + lint-staged pre-commit hook formatting/linting staged files.
- App builds and runs as an empty shell (default/placeholder content only).

Out of scope: theme detection mechanism (ticket 02), routing skeleton (ticket 02), the home screen's Tauri wiring proof (ticket 04), Vitest component/unit test _content_ beyond what scaffolding produces by default, WebdriverIO e2e (ticket 03), CI/CD pipeline (ticket 05).

**Blocked by:** None — can start immediately

**Status:** done — validated via `/code-review` (Standards + Spec axes) against `af42c72...HEAD`, commits `4f3547a`, `7630f07`

- [x] Angular 22 app is scaffolded inside the Tauri shell, zoneless (no `zone.js` dependency), components authored `OnPush`
- [x] Vitest is the configured test runner (no Karma/Jasmine)
- [x] `spartan/ui` (Brain + Helm) is installed and configured on Angular CDK + Tailwind CSS
- [x] `@angular/aria` is installed and available
- [x] `angular-eslint` and Prettier are configured
- [x] Husky + lint-staged pre-commit hook is wired and formats/lints staged files
- [x] The app builds (`ng build` / `tauri build` dev flow) and runs as an empty shell
- [x] No business screens, theme mechanism, or routing skeleton are introduced

**Review notes (non-blocking):** `src/index.html` has `lang="en"` though the shipped UI is French-only per `docs/architecture/technical-architecture.md` — worth fixing opportunistically. Generated spartan `button`/`provideSpartanHlm` scaffold output is present but unused/uncalled — harmless, not wired to any screen yet.
