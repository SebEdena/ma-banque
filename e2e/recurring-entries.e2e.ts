import { $ } from '@wdio/globals';

import { accountCard } from './support/accounts';
import { entryRows } from './support/entries';
import {
  dismissRulesModal,
  firstOfMonthsAgo,
  ruleRowPart,
  ruleRowPartContaining,
  setDateInput,
} from './support/recurring-rules';
import { ensureRoutedShell } from './support/routed-shell';

/**
 * The startup sweep is deliberately not exercised here. The suite shares one
 * app launch (`technical-architecture.md` §2.3), so a genuine startup trigger
 * isn't observable from inside it — the sweep's own behaviour is covered by
 * the all-accounts use case test in `usecases::recurring`. What this file
 * proves is the account-open generation path, through the real commands: the
 * rules modal is the first and only place they run unmocked.
 */
const RULE_LABEL = 'Loyer e2e';

/** The 1st of the month three months back — see `firstOfMonthsAgo`. */
const START_DATE = firstOfMonthsAgo(3);

/** That start date yields occurrences in M-3, M-2, M-1 and M. */
const BACKFILLED_OCCURRENCES = 4;

describe('recurring entries', () => {
  before(async () => {
    await ensureRoutedShell();
    await (await $('[data-testid="sidebar-home"]')).click();

    await (await $('[data-testid="new-account-header"]')).click();
    await (await $('[data-testid="account-name"]')).setValue('Compte périodique e2e');
    await (await $('[data-testid="account-opening-balance"]')).setValue('0');
    await (await $('[data-testid="account-save"]')).click();

    await (await accountCard('Compte périodique e2e').$('[data-testid="account-link"]')).click();
    await expect($('[data-testid="recurring-open"]')).toExist();
  });

  it('backfills the register from a rule starting months in the past', async () => {
    await (await $('[data-testid="recurring-open"]')).click();
    await expect($('[data-testid="recurring-empty"]')).toExist();

    await (await $('[data-testid="recurring-new"]')).click();
    await (await $('[data-testid="recurring-form-label"]')).setValue(RULE_LABEL);
    await (await $('[data-testid="recurring-form-amount"]')).setValue('-750');
    await setDateInput('recurring-form-start-date', START_DATE);
    await (await $('[data-testid="recurring-save"]')).click();

    // The list reloads from the backend after a successful write, so the row
    // standing here is the stored rule rather than the draft that was typed.
    await expect(
      ruleRowPartContaining(RULE_LABEL, 'recurring-row-schedule', 'Tous les mois'),
    ).toExist();

    await dismissRulesModal();
    await expect($('[data-testid="recurring-modal"]')).not.toExist();

    await expect(entryRows(RULE_LABEL)).toBeElementsArrayOfSize(BACKFILLED_OCCURRENCES);

    // User story 13: entries appearing on their own are explained rather than
    // mysterious. Waiting the toast out again also keeps it from covering the
    // controls the next scenario clicks.
    await expect(
      $(`//*[@data-sonner-toast][contains(., "${BACKFILLED_OCCURRENCES} écritures générées")]`),
    ).toExist();
    await $('[data-sonner-toast]').waitForExist({ reverse: true, timeout: 15000 });
  });

  it('scopes an amount edit to the next occurrence, leaving the rule itself alone', async () => {
    await (await $('[data-testid="recurring-open"]')).click();
    await (await ruleRowPart(RULE_LABEL, 'recurring-edit')).click();

    await (await $('[data-testid="recurring-form-amount"]')).setValue('-800');
    await (await $('[data-testid="recurring-save"]')).click();

    // Only a template change asks about scope; the amount is one, so the
    // dialog standing between the save and the write is itself the assertion.
    await expect($('[data-testid="recurring-scope-dialog"]')).toExist();
    await (await $('[data-testid="recurring-scope-next"]')).click();

    await expect(ruleRowPartContaining(RULE_LABEL, 'recurring-row-amount', '750,00')).toExist();
    await expect(ruleRowPartContaining(RULE_LABEL, 'recurring-row-amount', '800,00')).not.toExist();
  });

  it('deletes the rule behind its confirmation and keeps what it generated', async () => {
    // Picks up on the list the scenario above left standing, stated so a
    // failure here reads as "the modal wasn't open" rather than as a missing row.
    await expect($('[data-testid="recurring-modal"]')).toExist();

    await (await ruleRowPart(RULE_LABEL, 'recurring-delete')).click();

    await expect($(`//app-confirm-dialog[contains(., "${RULE_LABEL}")]`)).toExist();
    await (await $('[data-testid="confirm-accept"]')).click();

    await expect($('[data-testid="recurring-empty"]')).toExist();

    await dismissRulesModal();
    await expect($('[data-testid="recurring-modal"]')).not.toExist();

    await expect(entryRows(RULE_LABEL)).toBeElementsArrayOfSize(BACKFILLED_OCCURRENCES);
  });
});
