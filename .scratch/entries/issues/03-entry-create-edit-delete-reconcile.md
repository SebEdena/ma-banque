# 03 — Entry create/edit/delete & reconciliation toggle

**What to build:** The user records, corrects, and removes transactions directly in the register, and marks entries as reconciled row by row.

Scope, per `docs/spec/06-entries.md`:

- Extends `EntriesApi` (from ticket 02) with `create_entry`, `update_entry`, `delete_entry`, `set_reconciled`.
- A dedicated "Nouvelle écriture" row pinned at the top of the list for creating a new entry, with fields: label, category (dropdown over the existing category list — quick-create lands in ticket 04), date, debit/credit type, amount, description, reconciliation checkbox. The label is mandatory (save is blocked while it's empty); category may be left unset.
- Clicking an existing (non-system) entry turns it into an editable row in place; saving calls `update_entry`.
- Debit/credit↔amount sync is pure frontend: typing a negative amount flips the type selector and vice versa, the two stay consistent by construction — no separate synced state.
- Delete: a simple confirmation dialog, then `delete_entry`; unavailable on the system entry.
- Reconciled checkbox on each row calls `set_reconciled` directly, independent of the rest of the row's edit state.
- Amount validation matches the opening-balance field's existing rules (`money::to_cents` rejection of non-numeric/sub-cent input).
- `EntryError` variants (`SystemEntryReadOnly`, `UnknownCategory`, invalid amount, not found) surface as toasts; empty-label validation is inline next to the field, not a toast.

Out of scope: the category quick-create shortcut (ticket 04), the reconciliation panel/aggregate calculations (`08-reconciliation.md`), recurring-entry generation (`07-recurring-entries.md`).

**Blocked by:** `entries` ticket 02 — Entries screen: list, pagination & filters

**Status:** done

- [x] `EntriesApi` is extended with `create_entry`, `update_entry`, `delete_entry`, `set_reconciled`
- [x] The top "Nouvelle écriture" row creates an entry via `create_entry`; the list refetches/prepends on success
- [x] Clicking an existing non-system row toggles it into edit mode; saving calls `update_entry`
- [x] Typing a negative amount flips the debit/credit selector and vice versa, with the signed value sent as one consistent pair to `create_entry`/`update_entry`
- [x] Deleting an entry (behind a confirmation dialog) calls `delete_entry`; no delete affordance on the system entry
- [x] The reconciled checkbox on a row calls `set_reconciled` directly
- [x] Amount input rejects non-numeric/sub-cent input the same way the opening-balance field does
- [x] `EntryError` variants surface as toasts; empty-label validation is inline next to the field, blocking save while the label is empty
- [x] Component tests (Vitest) with mocked `EntriesApi`: create via top row, edit-in-place + save, delete behind confirmation, reconciled checkbox calls `setReconciled`, typing a negative amount flips the type selector and vice versa
