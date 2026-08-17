/**
 * The inline messages the label and amount fields raise, shared by the
 * register's `EntryForm` and the recurring rules modal's form.
 *
 * `docs/spec/07-recurring-entries.md` user story 27 asks for the rule form's
 * label and montant to be "validated exactly like the entry row's". The rules
 * themselves are one line each and read better where they are applied, but
 * the wording is what the user actually compares between the two screens, so
 * it lives in one place and can't drift.
 */
export const LABEL_REQUIRED_MESSAGE = 'Libellé obligatoire';
export const AMOUNT_INVALID_MESSAGE = 'Montant invalide';
