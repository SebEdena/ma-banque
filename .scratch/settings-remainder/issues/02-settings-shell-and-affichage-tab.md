# 02 — Settings screen shell + Affichage tab

**What to build:** The user opens the Settings screen and sees a left sub-nav with Postes / Affichage / Stockage (matching the prototype); the Affichage tab lets them pick a date-format preset, a currency-format preset (each shown with a live-formatted example), and a light/dark/system theme, all of which persist across restarts.

Scope, per `docs/spec/05-settings-remainder.md`:

- `Settings` becomes the screen shell: a left sub-nav with three entries. The existing `categories` child route becomes the "Postes" entry (kept as its current empty/"coming soon" placeholder — its real content is `04-categories.md`'s job, landing after this ticket); "Affichage" and "Stockage" are added as new sibling entries (routed as child routes or a local signal-driven switch — implementer's call).
- `SettingsApi` injectable service wraps `invoke()` for `get_display_settings` and `update_display_settings` (from ticket 01), plus the data-folder commands ticket 04 will use.
- Affichage tab: three date-format preset options (`JJ/MM/AAAA`, `AAAA-MM-JJ`, `MM/JJ/AAAA`) and three currency-format preset options (symbol-and-amount, amount-and-symbol, ISO code), each rendered with a live-formatted example value; selecting one calls `update_display_settings`.
- Theme control: extend the existing theme service (currently only supports light/dark, auto-detected via `matchMedia`) to add an explicit "system" mode, and add the Clair/Sombre/Système selector to this tab, bound to that service.
- `DisplaySettingsService`: a signal-backed service exposing `date_format`/`currency_format` for other features to read later, plus an amount-formatting function that takes an **already-decimal number** (e.g. `1234.56`) and only applies symbol position/separators — it never divides by 100 or touches cents. This ticket builds the service and this tab's control for it; no other screen consumes it yet.
- Errors from `update_display_settings` surface as toasts per `technical-architecture.md` §2.2.

Out of scope: the "Postes" tab's real content (`04-categories.md`), the "Stockage" tab (ticket 04), the first-launch/unreachable-folder prompt (ticket 03), any actual date/amount formatting on other screens (future specs).

**Blocked by:** 01 — Settings backend: `settings` table + display-settings use cases

**Status:** done

- [x] `Settings` renders a left sub-nav with Postes / Affichage / Stockage entries
- [x] The existing "Postes" (categories) placeholder is preserved as-is under the new shell
- [x] `SettingsApi` wraps `get_display_settings`/`update_display_settings` (and is ready for ticket 04 to extend with the folder commands)
- [x] Affichage tab shows 3 date presets and 3 currency presets, each with a live-formatted example, and selecting one persists via `update_display_settings`
- [x] Theme service supports an explicit "system" mode in addition to light/dark
- [x] Affichage tab's Clair/Sombre/Système control is bound to the theme service
- [x] `DisplaySettingsService` exposes signal-backed `date_format`/`currency_format` and an amount-formatting function operating on already-decimal numbers
- [x] Component tests (Vitest) with mocked `SettingsApi`: format controls call `update_display_settings`, theme control drives the theme service
- [x] Folder-action and settings-update errors surface as toasts, not silent failures
