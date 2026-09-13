# 05 — "Pointage" panel keeps checked entries visible by default

**What to build:** Opening the Pointage panel no longer force-enables "Non pointées uniquement" — already-reconciled entries stay visible by default. The toggle remains available as an explicit, user-controlled filter.

**Blocked by:** None — can start immediately

**Status:** done

- [x] Opening the Pointage panel does not automatically enable "Non pointées uniquement"; reconciled entries stay visible until the user opts in
- [x] Turning "Non pointées uniquement" on still filters correctly to unreconciled entries
- [x] The toggle's state isn't silently reset by opening/closing the panel
- [x] Existing reconciliation tests updated to reflect default-off behavior
