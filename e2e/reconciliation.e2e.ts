import { $, browser } from '@wdio/globals';

import { accountCard } from './support/accounts';
import { entryRow } from './support/entries';
import { ensureRoutedShell } from './support/routed-shell';

const ACCOUNT = 'Compte pointage e2e';
const OPENING_BALANCE = 100;
const RECONCILED_ENTRY = 'Loyer pointage e2e';
const PENDING_ENTRY = 'Salaire pointage e2e';

/**
 * Today in the seeded `DMY` display format — the format the statement-date
 * field parses. New entries are dated today, so a statement date of today is
 * what puts them inside the `date <= statement_date` cut-off.
 */
function todayInDisplayFormat(): string {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${today.getFullYear()}`;
}

async function addEntry(label: string, amount: string): Promise<void> {
  await (await $('[data-testid="entries-new"]')).click();
  await (await $('[data-testid="entry-form-label"]')).setValue(label);
  await (await $('[data-testid="entry-form-amount"]')).setValue(amount);
  await (await $('[data-testid="entry-save"]')).click();
  await expect(entryRow(label)).toExist();
}

/**
 * The statement-date field's own `<input>`: the testid sits on the
 * `<hlm-date-picker-input>` host, which can't be typed into directly.
 */
function statementDateField() {
  return $('[data-testid="reconciliation-statement-date"] input');
}

async function toggleReconciled(label: string): Promise<void> {
  await (await entryRow(label).$('[data-testid="entry-reconciled"]')).click();
}

describe('reconciliation', () => {
  before(async () => {
    await ensureRoutedShell();
    await (await $('[data-testid="sidebar-home"]')).click();

    await (await $('[data-testid="new-account-header"]')).click();
    await (await $('[data-testid="account-name"]')).setValue(ACCOUNT);
    await (await $('[data-testid="account-opening-balance"]')).setValue(String(OPENING_BALANCE));
    await (await $('[data-testid="account-save"]')).click();

    await (await accountCard(ACCOUNT).$('[data-testid="account-link"]')).click();
    await expect($('[data-testid="entries-new"]')).toExist();

    await addEntry(RECONCILED_ENTRY, '-30');
    await addEntry(PENDING_ENTRY, '50');

    // Ticked before the panel is ever opened, so opening it has something to
    // filter out — otherwise "the list narrowed" is indistinguishable from
    // "the filter did nothing".
    await toggleReconciled(RECONCILED_ENTRY);
    await expect(entryRow(RECONCILED_ENTRY).$('[data-testid="entry-reconciled"]')).toHaveAttribute(
      'data-reconciled',
      'true',
    );
  });

  it('opens the Pointage panel and narrows the list to the unreconciled entries', async () => {
    await expect($('[data-testid="reconciliation-panel"]')).not.toExist();
    await expect($('[data-testid="reconciliation-toggle"]')).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await (await $('[data-testid="reconciliation-toggle"]')).click();

    await expect($('[data-testid="reconciliation-panel"]')).toExist();
    await expect($('[data-testid="reconciliation-toggle"]')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect($('[data-testid="reconciliation-filter"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await expect(entryRow(RECONCILED_ENTRY)).not.toExist();
    await expect(entryRow(PENDING_ENTRY)).toExist();
  });

  it('prompts for a statement date before showing any reconciled balance', async () => {
    await expect($('[data-testid="reconciliation-statement-date-prompt"]')).toExist();
    await expect($('[data-testid="reconciliation-reconciled-balance"]')).not.toExist();

    await (await statementDateField()).setValue(todayInDisplayFormat());
    await browser.keys('Enter');

    await expect($('[data-testid="reconciliation-statement-date-prompt"]')).not.toExist();
    // The opening balance counts as reconciled, so 100 − 30.
    await expect($('[data-testid="reconciliation-reconciled-balance"]')).toHaveText('70,00 €');
  });

  it('reports a signed discrepancy once the bank balance is set', async () => {
    await expect($('[data-testid="reconciliation-delta"]')).not.toExist();

    await (await $('[data-testid="reconciliation-bank-balance"]')).setValue('120');
    await browser.keys('Tab');

    await expect($('[data-testid="reconciliation-delta"]')).toHaveText('50,00 €');
    await expect($('[data-testid="reconciliation-verdict"]')).toHaveText('Écart détecté');
  });

  it('flips the verdict to balanced when the last entry is ticked', async () => {
    await toggleReconciled(PENDING_ENTRY);

    await expect(entryRow(PENDING_ENTRY)).not.toExist();
    await expect($('[data-testid="reconciliation-delta"]')).toHaveText('0,00 €');
    await expect($('[data-testid="reconciliation-verdict"]')).toHaveText('Comptes pointés');
  });

  it('restores the full list when the panel is collapsed', async () => {
    await (await $('[data-testid="reconciliation-toggle"]')).click();

    await expect($('[data-testid="reconciliation-panel"]')).not.toExist();
    await expect($('[data-testid="reconciliation-toggle"]')).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await expect(entryRow(RECONCILED_ENTRY)).toExist();
    await expect(entryRow(PENDING_ENTRY)).toExist();
  });
});
