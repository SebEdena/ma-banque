# 04 — Account settings modal (create/edit)

**What to build:** The user creates a new account (name, color, icon, opening balance, opening date) from Home's "Nouveau compte" card, or edits an existing account's same fields from the same shared modal, with the opening-date/opening-balance rules enforced.

Scope, per `docs/spec/03-accounts.md`:

- One shared modal component (not a routed screen) for both create and edit — matching the prototype's "Nouveau compte"/"Paramètres du compte." Opened from `Home`'s "Nouveau compte" card for creation in this ticket; `06-entries.md` reuses it for editing from the entries screen later.
- Fields: name, opening balance, opening date (defaults to today on create), icon, color — using the shared pickers from ticket 02.
- Opening balance is sent to `create_account`/`update_account` as the user's typed major-unit `f64` value exactly as typed — no client-side rounding or cents conversion.
- `AccountError` variants (`HasNonSystemEntries`, opening-date-before-first-entry) surface as toasts; the modal's own field validation (empty name, non-numeric/negative balance) is inline next to the field, not a toast.
- No delete action in this modal — delete only exists in the archived-accounts view (ticket 05).
- Extends `AccountsApi` (from ticket 03) with `create_account`/`update_account`.

Out of scope: the archived-accounts view and its restore/delete actions (ticket 05), editing from the entries screen (`06-entries.md` wires that entry point later).

**Blocked by:** 01, 02, 03

**Status:** ready-for-agent

- [ ] Shared modal component handles both create and edit modes
- [ ] Fields: name, opening balance, opening date (defaults to today on create), icon, color picker (reusing ticket 02's components)
- [ ] Create mode is reachable from Home's "Nouveau compte" card
- [ ] Opening balance is sent as the typed major-unit `f64`, untouched by the client
- [ ] `AccountError` variants surface as toasts; field validation errors are inline
- [ ] No delete action is rendered in this modal
- [ ] `AccountsApi` is extended with `create_account`/`update_account`
- [ ] Component tests (Vitest) with mocked `AccountsApi`: form validation, create vs. edit mode, save/cancel call the right methods, no delete action rendered
