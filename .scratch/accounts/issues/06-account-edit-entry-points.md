# 06 — Reachable "edit account" entry point

**What to build:** A "Paramètres"/edit action on an account — reachable from Home's account card and/or the account screen — opens the existing account-settings modal pre-filled in edit mode, so name, color, icon, and opening balance can actually be changed after the account is created.

**Blocked by:** 04 — Account settings modal (already implemented; this ticket only wires up a missing entry point to it)

**Status:** done

- [x] An edit affordance exists on the account card (Home) and the account screen header
- [x] Activating it opens the existing account-settings modal in edit mode, pre-filled with that account's current values
- [x] Saving updates the account, including opening balance, via the existing update path
- [x] Component tests: the edit entry point opens the modal in edit mode with the right account; saving calls the update method, not create
