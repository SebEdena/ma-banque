# 03 — Home screen: account cards + archive toggle

**What to build:** The user opens the app and sees all active accounts as cards (name, color, balance, last-entry date); archived accounts are hidden behind a count/toggle; each active card has a small archive action.

Scope, per `docs/spec/03-accounts.md`:

- `AccountsApi` injectable service wraps `invoke()` for `list_active_accounts`, `list_archived_accounts`, `archive_account` (unarchive/delete/create/update land in later tickets but the service can be extended in place).
- `Home` renders active accounts as cards (name, color, balance, last-entry date) — no reconciliation indicator, per the spec's explicit decision.
- Archived/active toggle: a "Comptes archivés (N)" affordance switching the displayed list between active and archived — this ticket only needs the toggle and the archived list rendering; restore/delete actions on archived cards land in ticket 05.
- Each active card exposes a small archive action calling `archive_account`.
- The sidebar's account rail reflects the same active-accounts list as the home screen.
- Removes `Home`'s temporary data-folder plain-text proof (from `02-setup-frontend-ci.md`) — its permanent home is `05-settings-remainder.md`'s Settings screen, which already builds the first-launch prompt taking over that responsibility.

Out of scope: the account settings modal / "Nouveau compte" creation flow (ticket 04), archived-view restore/delete actions (ticket 05), the entries screen the cards route to (`06-entries.md`).

**Blocked by:** 01 — Accounts backend

**Status:** ready-for-agent

- [ ] `AccountsApi` wraps `list_active_accounts`, `list_archived_accounts`, `archive_account`
- [ ] `Home` renders active accounts as cards: name, color, balance, last-entry date — no reconciliation indicator
- [ ] Archived accounts are hidden from the default view, with a count/toggle to reveal them
- [ ] Each active card has an archive action calling `archive_account`
- [ ] Clicking a card navigates toward the account (entries screen route, built later)
- [ ] The sidebar account rail reflects the same active-accounts list
- [ ] `Home`'s temporary `invoke('get_current_data_folder')` proof and its plain-text rendering are removed
- [ ] Component tests (Vitest) with mocked `AccountsApi`: renders cards, hides archived accounts, toggle switches lists, archive action calls `archive_account`
