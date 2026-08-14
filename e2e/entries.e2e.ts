import { $ } from '@wdio/globals';

import { accountCard } from './support/accounts';
import { categoryOption, entryRow } from './support/entries';
import { ensureRoutedShell } from './support/routed-shell';

describe('entries', () => {
  before(async () => {
    await ensureRoutedShell();
    await (await $('[data-testid="sidebar-home"]')).click();

    await (await $('[data-testid="new-account-header"]')).click();
    await (await $('[data-testid="account-name"]')).setValue('Compte écritures e2e');
    await (await $('[data-testid="account-opening-balance"]')).setValue('100');
    await (await $('[data-testid="account-save"]')).click();

    await (await accountCard('Compte écritures e2e').$('[data-testid="account-link"]')).click();
    await expect($('[data-testid="entries-new"]')).toExist();
  });

  it('creates an entry from the inline row', async () => {
    await (await $('[data-testid="entries-new"]')).click();
    await expect($('[data-testid="entry-new-row"]')).toExist();

    await (await $('[data-testid="entry-form-label"]')).setValue('Courses e2e');
    await (await $('[data-testid="entry-form-amount"]')).setValue('-12,50');
    await (await $('[data-testid="entry-save"]')).click();

    await expect($('[data-testid="entry-new-row"]')).not.toExist();
    await expect(entryRow('Courses e2e')).toExist();
  });

  it('edits the entry in place', async () => {
    await entryRow('Courses e2e').click();
    await expect($('[data-testid="entry-form-label"]')).toExist();

    await (await $('[data-testid="entry-form-label"]')).setValue('Courses e2e modifiées');
    await (await $('[data-testid="entry-save"]')).click();

    await expect(entryRow('Courses e2e modifiées')).toExist();
    await expect(entryRow('Courses e2e')).not.toExist();
  });

  it('toggles the entry’s reconciled checkbox from its row', async () => {
    const checkbox = entryRow('Courses e2e modifiées').$('[data-testid="entry-reconciled"]');
    await expect(checkbox).toHaveAttribute('data-reconciled', 'false');

    await (await checkbox).click();

    await expect(
      entryRow('Courses e2e modifiées').$('[data-testid="entry-reconciled"]'),
    ).toHaveAttribute('data-reconciled', 'true');
  });

  it('creates a category from the entry row and leaves it selected', async () => {
    await entryRow('Courses e2e modifiées').click();
    await (await $('[data-testid="entry-form-category"]')).selectByAttribute('value', '__new__');

    await (await $('[data-testid="category-name"]')).setValue('Poste écriture e2e');
    await (await $('[data-testid="icon-option"]')).click();
    await (await $('[data-testid="category-save"]')).click();

    // `option:checked` isn't usable here — WebKit matches it against the
    // `selected` attribute, which Angular's property binding never writes.
    await expect(categoryOption('Poste écriture e2e')).toBeSelected();

    await (await $('[data-testid="entry-save"]')).click();
    await expect(entryRow('Courses e2e modifiées').$('[data-testid="entry-category"]')).toHaveText(
      'Poste écriture e2e',
      { containing: true },
    );
  });

  it('deletes the entry behind a confirmation naming it', async () => {
    await (await entryRow('Courses e2e modifiées').$('[data-testid="entry-delete"]')).click();

    const dialog = $('app-confirm-dialog');
    await expect(dialog).toHaveText('Courses e2e modifiées', { containing: true });
    await (await $('[data-testid="confirm-accept"]')).click();

    await expect(entryRow('Courses e2e modifiées')).not.toExist();
  });
});
