# 04 — Stockage tab (move / open data folder actions)

**What to build:** In the Settings screen's Stockage tab, the user sees their current data folder location and can either move it to a new destination or point the app at a different folder entirely, with clear errors when either action can't safely proceed.

Scope, per `docs/spec/05-settings-remainder.md`:

- Stockage tab shows the current data folder path (`get_current_data_folder`) and two distinct actions — "Move data folder" and "Open a different folder" — each opening a native folder-picker dialog via Tauri's dialog plugin.
- "Move data folder" calls `move_data_folder`; "Open a different folder" calls `open_data_folder`. Both are the exact commands already built and tested in `01-setup-backend.md` — no backend changes.
- The destination-occupied error (move) and invalid-database error (open) are surfaced as toasts verbatim, per `technical-architecture.md` §2.2 — no rewording.
- Extends `SettingsApi` (from ticket 02) with the folder commands.

Out of scope: the first-launch/unreachable-folder prompt (ticket 03, though both consume the same backend commands), the Affichage tab (ticket 02), any backend changes to the folder commands (frozen by `01-setup-backend.md`).

**Blocked by:** 02 — Settings screen shell + Affichage tab

**Status:** done

- [x] Stockage tab displays the current data folder path
- [x] "Move data folder" opens a folder picker and calls `move_data_folder`
- [x] "Open a different folder" opens a folder picker and calls `open_data_folder`
- [x] The destination-occupied error (move) and invalid-database error (open) surface as toasts, verbatim
- [x] `SettingsApi` is extended with the folder commands
- [x] Component tests (Vitest) with mocked `SettingsApi`: each action calls the right method and surfaces returned errors verbatim
