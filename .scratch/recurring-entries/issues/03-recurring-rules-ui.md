# 03 — Recurring rules UI

**What to build:** The account-scoped "Écritures périodiques" modal — list of rules, create/edit form reusing the entry-row field vocabulary, delete behind confirmation, and the scope-choice dialog for template edits. Done when a user can fully manage an account's recurring rules from its own screen without touching global settings.

**Blocked by:** 01 — needs the CRUD commands. (Independent of 02; can be built in parallel with it.)

**Status:** ready-for-agent

- [ ] `RecurringRulesApi` at `src/app/data/recurring-rules/`: injectable wrapping `invoke()` for the four CRUD commands, a `parseRecurringError` covering every `RecurringError` kind, and an `InMemoryRecurringRulesApi` wired into `app.config.ts`'s `mockProviders` for `npm run start:mock`.
- [ ] A toolbar button "Écritures périodiques" on the account screen, beside "Nouvelle écriture", opening a modal (not a route).
- [ ] Modal **list state**: one row per rule — poste swatch, label, signed amount (via `currency-format`), a plain-language schedule summary ("Tous les mois", "Tous les 2 mois", "Toutes les 3 semaines", "Tous les ans") plus the date range; edit and delete affordances per row; delete goes through `ConfirmDialog`; an empty list shows an empty state plus the create affordance.
- [ ] Modal **form state**: reuses the entry-row field vocabulary (label, poste select with colour/icon swatch, débit/crédit selector synced with amount, description) plus the schedule fields (frequency select, interval number input, start/end date with end date clearable). Field-level validation (empty label, unreadable amount, interval < 1, end date before start date) renders inline; command rejections toast.
- [ ] Saving an edit that changed any **template** field opens the scope dialog first ("Uniquement la prochaine occurrence" / "La prochaine et toutes les suivantes" / cancel); it is skipped when only schedule fields changed, and when creating a new rule.
- [ ] The modal and its controls carry the current account's accent colour via the existing `data-accent`/`data-accent-solid` attributes.
- [ ] Angular component tests (Vitest, `RecurringRulesApi` mocked, never `invoke()` directly): the modal renders a list from the mocked Api and its empty state when there are none; creating a rule calls `createRecurringRule` with the form's values; editing a template field opens the scope dialog and the chosen scope reaches `updateRecurringRule`; editing only a schedule field skips the dialog; deleting calls `deleteRecurringRule` behind `ConfirmDialog`; each of the four field-level validations renders inline without calling the Api.
