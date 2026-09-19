# 05 — Simplify settings section navigation

**What to build:** Replace the sidebar-style section navigation in the Settings screen with a simpler form control (e.g. a `<select>`) for choosing between Postes / Affichage / Stockage, dropping the current VS Code/GitHub-style sidebar layout.

**Blocked by:** None — can start immediately

**Status:** reverted — PR review (ma-banque#16) decided the sidebar nav was correct as-is; only its row styling needed a pass (dividers instead of pill hover), not a switch to a select control.

- [x] ~~Settings section switcher is a standard form control (e.g. a select), not a sidebar nav list~~ reverted per review
- [x] All three sections (Postes, Affichage, Stockage) remain reachable and functionally unchanged
- [x] Sidebar rows now use hairline dividers, styled closer to the reference the reviewer attached
- [x] Component tests updated back to the sidebar-nav assertions
