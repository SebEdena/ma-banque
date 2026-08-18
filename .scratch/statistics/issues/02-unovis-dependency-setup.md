# 02 — Unovis dependency setup

**What to build:** Add and verify the charting dependency this feature relies on, before any chart-building work starts on top of it.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] `@unovis/ts` and `@unovis/angular` added as dependencies.
- [x] The installed `@unovis/angular` version's supported Angular range is confirmed to cover this repo's `^22.1.0` (Unovis 1.7+ tracks Angular's own LTS window rather than a fixed floor) — pin the version accordingly and note the check in the PR/commit.
- [x] A minimal smoke usage (e.g. a throwaway `vis-donut`/`vis-xy-container` render in a scratch route or a unit test bootstrapping the module) confirms the package renders inside this app's build (Vite/Angular build pipeline) without configuration issues.
