# 02 — "Unreconciled only" filter (backend)

**What to build:** A real backend query parameter that narrows the entries list to unreconciled entries, composing correctly with the existing date-range/sort/pagination contract. Done when `list_entries`/jump-to-date honour the flag as a genuine `WHERE` predicate, not a frontend buffer filter.

**Blocked by:** None — independent of 01; only touches `06-entries.md`'s entry-listing query.

**Status:** ready-for-agent

- [ ] `unreconciled_only: bool` added to `EntryListQuery` (Rust) and threaded through `list_entries`/`list_by_account`'s `WHERE` clause.
- [ ] The system entry is exempt from the filter (always included), consistent with its existing exemption from the date-range filter.
- [ ] `offset_for_date` applies the same predicate as `list_by_account` when the flag is set, so jump-to-date lands on the correct row under the active filter.
- [ ] SQLite integration tests: reconciled entries are excluded when the flag is set; the system entry is included regardless; the flag composes correctly with an active date range and with both sort directions; a pagination case proves a page is a page of _matching_ rows — an account whose first 50 entries are all reconciled still returns a full page of unreconciled ones when the flag is set, not an empty page.
- [ ] SQLite integration test: `offset_for_date` applies the same predicate, landing on the right row with the filter on.
