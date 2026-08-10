# 05 — Archived-accounts view: restore & delete

**What to build:** From the archived-accounts view (reached via Home's toggle), the user can restore (unarchive) an account back to active, or permanently delete one that has no activity beyond its opening balance, behind a named confirmation.

Scope, per `docs/spec/03-accounts.md`:

- Archived view (from ticket 03's toggle) shows a restore action (`unarchive_account`) and a delete action (`delete_account`) per archived account.
- Delete requires a confirmation dialog naming the account before calling `delete_account`. `delete_account` is blocked server-side (`AccountError::HasNonSystemEntries`) whenever the account has entries beyond its system entry — this UI surfaces that error as a toast if it somehow occurs (e.g. race), but the primary UX is simply offering the action and confirming.
- Extends `AccountsApi` with `unarchive_account`/`delete_account`.

Out of scope: the create/edit modal (ticket 04), any change to the deletion guard itself (already built in ticket 01).

**Blocked by:** 01, 03

**Status:** done

- [x] Archived view shows a restore action per account, calling `unarchive_account`
- [x] Archived view shows a delete action per account, gated behind a confirmation dialog naming the account
- [x] Delete calls `delete_account` only after confirmation is accepted
- [x] `AccountError::HasNonSystemEntries` (or any other error) surfaces as a toast if returned
- [x] `AccountsApi` is extended with `unarchive_account`/`delete_account`
- [x] Component tests (Vitest) with mocked `AccountsApi`: restore calls `unarchive_account`, delete calls `delete_account` only after confirmation is accepted, not on the initial click
