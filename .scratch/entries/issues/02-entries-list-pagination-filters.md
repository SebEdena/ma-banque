# 02 — Entries screen: list, pagination & filters

**What to build:** Opening an account shows its entries as a virtual-scrolled, reverse-orderable list instead of the `<p>Compte — à venir</p>` placeholder, with a date-range filter and jump-to-date — read-only for now (create/edit/delete land in ticket 03).

Scope, per `docs/spec/06-entries.md`:

- `EntriesApi` injectable service (`src/app/core/entries-api`, mirroring `AccountsApi`/`CategoriesApi`) wraps `invoke()` for `list_entries` (create/update/delete/set_reconciled land in ticket 03's extension of this same service).
- `Account` becomes the entries screen: header reusing the color/name/icon presentation from the home screen's cards, entries list rendered via Angular CDK Virtual Scroll, pages fetched from `EntriesApi.listEntries` and appended as the user scrolls.
- Sorted most-recent-first by default, with a control to reverse the order.
- Date-range filter and jump-to-date, both driving what's requested from `EntriesApi`.
- The system entry renders in the list but with no edit-in-place or delete affordance.
- Amounts and dates render through `DisplaySettingsService`'s existing `currency-format`/`date-format` pipes, exactly as the home screen already does.
- Per business requirements §5, the account's accent color is applied to every interactive element on this screen (filters, controls) — the first screen-wide application of that rule.

Out of scope: creating/editing/deleting entries and the reconciled toggle (ticket 03), the category quick-create shortcut (ticket 04), the reconciliation panel (`08-reconciliation.md`).

**Blocked by:** `entries` ticket 01 — Entries backend

**Status:** ready-for-agent

- [ ] `EntriesApi` wraps `list_entries`
- [ ] `Account` renders a page of entries from `EntriesApi.listEntries`, sorted most-recent-first by default
- [ ] A reverse-order control flips the sort direction and re-requests accordingly
- [ ] The list is Angular CDK Virtual Scroll, fetching and appending further pages as the user scrolls
- [ ] A date-range filter changes what's requested from `EntriesApi`
- [ ] Jump-to-date scrolls the list to the page containing the first entry at or before the target date
- [ ] The system entry renders in the list with no edit-in-place or delete affordance
- [ ] Amounts and dates render through `DisplaySettingsService`'s `currency-format`/`date-format` pipes
- [ ] The account's accent color is applied to every interactive element on the screen
- [ ] Component tests (Vitest) with mocked `EntriesApi`: renders a page of entries, system entry renders read-only, reverse-order control and date-range filter change what's requested
