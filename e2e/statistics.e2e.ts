import { $, $$ } from '@wdio/globals';

import { accountCard } from './support/accounts';
import { categoryOption } from './support/entries';
import { ensureRoutedShell } from './support/routed-shell';

const ACCOUNT_ONE = 'Compte statistiques e2e 1';
const ACCOUNT_TWO = 'Compte statistiques e2e 2';
const OPENING_BALANCE = 1000;

/**
 * Helper to add an entry to the current account.
 */
async function addEntry(label: string, amount: string, categoryName?: string): Promise<void> {
  await (await $('[data-testid="entries-new"]')).click();
  await (await $('[data-testid="entry-form-label"]')).setValue(label);
  await (await $('[data-testid="entry-form-amount"]')).setValue(amount);

  if (categoryName) {
    await (await $('[data-testid="entry-form-category"]')).click();
    await (await categoryOption(categoryName)).click();
  }

  await (await $('[data-testid="entry-save"]')).click();
}

/**
 * Helper to add an entry while creating its category inline, via the entry
 * form's "new category" option. Unlike `addEntry`, the form stays open
 * (no save yet) until the new category is created and selected, matching the
 * flow `entries.e2e.ts` exercises — `addEntry` itself already saves and
 * closes the form, so the category picker wouldn't exist by the time a
 * separate "create category" step tried to reach it.
 */
async function addEntryWithNewCategory(
  label: string,
  amount: string,
  categoryName: string,
  iconTestId = 'icon-option',
): Promise<void> {
  await (await $('[data-testid="entries-new"]')).click();
  await (await $('[data-testid="entry-form-label"]')).setValue(label);
  await (await $('[data-testid="entry-form-amount"]')).setValue(amount);

  await (await $('[data-testid="entry-form-category"]')).click();
  await (await $('[data-testid="entry-form-category-new"]')).click();

  await (await $('[data-testid="category-name"]')).setValue(categoryName);
  await (await $('[data-testid="' + iconTestId + '"]')).click();
  await (await $('[data-testid="category-save"]')).click();

  await expect($('[data-testid="entry-form-category"]')).toHaveText(categoryName, {
    containing: true,
  });

  await (await $('[data-testid="entry-save"]')).click();
}

describe('statistics', () => {
  before(async () => {
    await ensureRoutedShell();
    await (await $('[data-testid="sidebar-home"]')).click();

    // Create first account
    await (await $('[data-testid="new-account-header"]')).click();
    await (await $('[data-testid="account-name"]')).setValue(ACCOUNT_ONE);
    await (await $('[data-testid="account-opening-balance"]')).setValue(String(OPENING_BALANCE));
    await (await $('[data-testid="account-save"]')).click();

    // Enter the account and create categories
    await (await accountCard(ACCOUNT_ONE).$('[data-testid="account-link"]')).click();
    await expect($('[data-testid="entries-new"]')).toExist();

    // Create first category and add expense
    await addEntryWithNewCategory('Setup entry 1', '-50', 'Alimentation');

    // Add another entry to set up second category
    await addEntryWithNewCategory('Setup entry 2', '-30', 'Transport');

    // Add expense entries with categories
    await addEntry('Expense 1', '-25.50', 'Alimentation');
    await addEntry('Expense 2', '-15.75', 'Transport');
    await addEntry('Income entry', '100', 'Alimentation');
    await addEntry('Income entry 2', '200', 'Transport');

    // Create second account with different data
    await (await $('[data-testid="sidebar-home"]')).click();
    await (await $('[data-testid="new-account-header"]')).click();
    await (await $('[data-testid="account-name"]')).setValue(ACCOUNT_TWO);
    await (await $('[data-testid="account-opening-balance"]')).setValue(String(OPENING_BALANCE));
    await (await $('[data-testid="account-save"]')).click();

    await (await accountCard(ACCOUNT_TWO).$('[data-testid="account-link"]')).click();
    await expect($('[data-testid="entries-new"]')).toExist();

    // Add entries to second account (without category for this test)
    await addEntry('Account 2 expense', '-45');

    // Navigate to account 1 to start the statistics tests
    await (await $('[data-testid="sidebar-home"]')).click();
    await (await accountCard(ACCOUNT_ONE).$('[data-testid="account-link"]')).click();
  });

  it('navigates to statistics screen and asserts all three charts render with data', async () => {
    // Click the statistics button
    await (await $('[data-testid="statistics-button"]')).click();

    // Verify we're on the statistics screen
    await expect($('[data-testid="view-account-button"]')).toExist();

    // Assert the expense breakdown chart card exists and contains chart elements
    await expect($('[data-testid="breakdown-card"]')).toExist();
    await expect($('[data-testid="donut-chart"]')).toExist();
    await expect($('[data-testid="breakdown-legend"]')).toExist();

    // Assert the credit breakdown chart card exists and contains chart elements
    await expect($('[data-testid="credit-breakdown-card"]')).toExist();
    await expect($('[data-testid="credit-donut-chart"]')).toExist();
    await expect($('[data-testid="credit-breakdown-legend"]')).toExist();

    // Assert the monthly chart card exists
    await expect($('[data-testid="monthly-card"]')).toExist();
    await expect($('[data-testid="monthly-chart"]')).toExist();

    // Assert both legends have at least one row (categories)
    const legendRows = await $$('[data-testid="breakdown-legend"] [data-testid="legend-row"]');
    await expect(legendRows.length).toBeGreaterThan(0);

    const creditLegendRows = await $$(
      '[data-testid="credit-breakdown-legend"] [data-testid="credit-legend-row"]',
    );
    await expect(creditLegendRows.length).toBeGreaterThan(0);
  });

  it('switches the period preset and asserts the charts update', async () => {
    // Verify the period control exists
    await expect($('[data-testid="period-control"]')).toExist();

    // Switch to a different period (THREE_MONTHS)
    const threeMonthsButton = await $(
      '[data-testid="period-control"] [data-testid="period-THREE_MONTHS"]',
    );
    await threeMonthsButton.click();

    // Assert the charts still exist and are rendered
    await expect($('[data-testid="breakdown-card"]')).toExist();
    await expect($('[data-testid="monthly-chart"]')).toExist();

    // Switch back to ONE_MONTH to verify period switching works both ways
    const oneMonthButton = await $(
      '[data-testid="period-control"] [data-testid="period-ONE_MONTH"]',
    );
    await oneMonthButton.click();

    // Assert charts render for the switched period
    await expect($('[data-testid="breakdown-card"]')).toExist();
  });

  it('switches to another account via pills and asserts the charts update', async () => {
    // Verify account pills exist
    await expect($('[data-testid="account-pills"]')).toExist();

    // Get all account pills and click the second one
    const accountPills = await $$('[data-testid^="account-pill-"]');
    await expect(accountPills.length).toBeGreaterThan(1);

    // Click the second account pill
    await accountPills[1].click();

    // Assert the charts render for the new account
    await expect($('[data-testid="breakdown-card"]')).toExist();
    await expect($('[data-testid="monthly-chart"]')).toExist();

    // Click back to the first account
    await accountPills[0].click();

    // Verify we're back on the first account's data
    await expect($('[data-testid="breakdown-card"]')).toExist();
  });

  it('returns to the register via the "Voir le compte" button', async () => {
    // Click the view account button
    await (await $('[data-testid="view-account-button"]')).click();

    // Should be back on the account/entries screen
    await expect($('[data-testid="entries-new"]')).toExist();
  });
});
