# 02 — Theme detection & routing skeleton

**What to build:** The app detects the user's system light/dark preference on first launch and exposes a theme service/signal that future screens (and the future Settings screen's manual override UI) can build on, and a routing skeleton exists with placeholder routes for every screen named in the business requirements — so later feature specs have a place to attach their screens without re-deciding routing structure or theme plumbing.

Scope, per `docs/spec/02-setup-frontend-ci.md`:

- Theme service/signal exposing "current theme", using Tailwind's `dark:` variant; system preference detected via `prefers-color-scheme` on first launch.
- No manual override UI — that belongs to the future Settings screen (business requirements §4.6); only the mechanism it will call is established here.
- Routing skeleton with placeholder routes for home, account, categories, stats, and settings (business requirements §4). Placeholder routes may render empty/"coming soon" content — no business logic behind them.

Out of scope: any business screen content, the Settings screen's manual theme-override UI, the home screen's Tauri wiring proof (ticket 04).

**Blocked by:** 01 — Angular scaffold, UI stack & code-style tooling

**Status:** ready-for-agent

- [ ] Theme service/signal exists, exposing the current theme (light/dark)
- [ ] System preference (`prefers-color-scheme`) is detected on first launch and applied via Tailwind's `dark:` variant
- [ ] Theme detection is unit-tested (asserts the theme class/state under a given system preference)
- [ ] Routing skeleton has placeholder routes for home, account, categories, stats, and settings
- [ ] Each placeholder route is component-tested (renders its expected placeholder content)
- [ ] No business logic or manual theme-override UI is introduced
