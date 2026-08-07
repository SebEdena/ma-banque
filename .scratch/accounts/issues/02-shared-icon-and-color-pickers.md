# 02 — Shared icon & color picker components

**What to build:** A reusable icon picker (Lucide icon grid with keyword search) and color picker (fixed swatch row) that any future create/edit form — accounts here, categories in the sibling spec — can drop in without re-implementing icon/color selection.

Scope, per `docs/spec/03-accounts.md` and `docs/spec/04-categories.md`:

- Icon picker: grid of Lucide icons with a "Rechercher une icône" keyword search box, backed by a small bundled icon-name-to-keyword index (not a live external lookup) — matches the prototype's shape, keeps it offline and fast.
- Color picker: fixed row of ~10 color swatches, matching the prototype.
- Built once, in a shared location (implementer's call) importable by both the account settings modal (ticket 04) and the categories panel (`categories` feature, ticket 07) — neither spec re-implements its own copy.
- No backend dependency — pure frontend components.

Out of scope: wiring these into the account modal or categories panel themselves (tickets 04 and 07 consume them).

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Icon picker renders a grid of Lucide icons and filters by keyword search against a bundled index
- [ ] Color picker renders a fixed row of swatches and emits the selected color
- [ ] Both components live in a shared, non-feature-specific location
- [ ] Component tests (Vitest): icon search filters the shown icons, color picker emits selection
