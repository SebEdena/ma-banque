# 03 — First-launch / unreachable-folder blocking prompt

**What to build:** On first launch (no data folder configured yet) or whenever the configured data folder becomes unreachable, the user sees a blocking prompt offering "Use default location" or "Choose a folder" before any other screen renders; once resolved, the app proceeds normally. The temporary plain-text data-folder proof on the home screen is removed, since this prompt now owns that responsibility.

Scope, per `docs/spec/05-settings-remainder.md`:

- A top-level guard (e.g. an Angular route guard or an app-root resolver — implementer's call, and the first guard/resolver introduced in this codebase) calls `get_current_data_folder` before rendering the routed shell.
- On `null`/error, renders a blocking prompt component (not a route): "Use default location" (→ `set_default_data_folder`) and "Choose a folder" (→ `open_data_folder`, via the OS folder picker through Tauri's dialog plugin). Once resolved, normal routing proceeds.
- This replaces `Home`'s temporary `invoke('get_current_data_folder')` proof entirely — remove that call and its rendered plain-text state from `Home`, since the guard now handles this before `Home` ever renders. (`03-accounts.md` gives `Home` its real job independently; whichever of that spec or this one lands second would otherwise have done this removal — this ticket does it now.)
- No form fields to validate inline; any error from the two commands surfaces as a toast per `technical-architecture.md` §2.2.

Out of scope: the Settings screen's Stockage tab and its Move/Open-a-different-folder actions (ticket 04), the Affichage tab (ticket 02), any Settings backend changes (ticket 01) — this ticket only consumes the already-existing `01-setup-backend.md` folder commands.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] A top-level guard/resolver calls `get_current_data_folder` before the routed shell renders
- [ ] On `null`/error, a blocking prompt component renders instead of the routed shell, offering "Use default location" and "Choose a folder"
- [ ] "Use default location" calls `set_default_data_folder`; "Choose a folder" opens the OS folder picker (Tauri dialog plugin) and calls `open_data_folder`
- [ ] Once either action succeeds, normal routing proceeds to the shell
- [ ] Errors from either command surface as a toast
- [ ] `Home`'s temporary `invoke('get_current_data_folder')` proof and its plain-text rendering are removed
- [ ] Component test (Vitest): prompt renders when `get_current_data_folder` resolves to `null`/rejects, and each choice calls the right `SettingsApi`/folder command
- [ ] e2e scenario (WebdriverIO): fresh `.dev-data/` → app launches → prompt appears → choosing default location proceeds to the shell
