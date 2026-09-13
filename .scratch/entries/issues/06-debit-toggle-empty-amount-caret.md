# 06 — Fix débit/crédit toggle on an empty amount field

**What to build:** Selecting "Débit" (or "Crédit") on a blank amount field no longer leaves the field in a state where part of it can't be typed into — the user can click anywhere in the field and type a digit immediately, regardless of where the caret lands relative to the sign.

Root cause: toggling the sign on an empty amount currently writes a bare sign character into the field instead of leaving it empty, and the amount input's typing guard only accepts a leading sign — so a caret placed before that character blocks all further input.

**Blocked by:** None — can start immediately

**Status:** done

- [ ] Selecting "Débit" or "Crédit" on an empty amount field leaves it either empty or immediately typable, with no stray sign character the user can't type around
- [ ] Typing a digit works regardless of where the caret lands in the field
- [ ] Existing débit/crédit sign-toggling behavior for a non-empty amount is unchanged
- [ ] Component tests cover: toggling sign on empty amount, then typing a value; toggling sign on a non-empty amount
