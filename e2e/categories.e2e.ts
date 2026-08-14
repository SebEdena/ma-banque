import { $ } from '@wdio/globals';

import { accountCard } from './support/accounts';
import { categoryCard } from './support/categories';
import { entryRow } from './support/entries';
import { ensureRoutedShell } from './support/routed-shell';

describe('categories', () => {
  before(async () => {
    await ensureRoutedShell();
    await (await $('[data-testid="sidebar-settings"]')).click();
    await expect($('[data-testid="category-create"]')).toExist();
  });

  it('creates a category from the Postes tab', async () => {
    await (await $('[data-testid="category-create"]')).click();

    await (await $('[data-testid="category-name"]')).setValue('Poste e2e');
    await (await $('[data-testid="icon-option"]')).click();
    await (await $('[data-testid="category-save"]')).click();

    await expect(categoryCard('Poste e2e')).toExist();
  });

  it('edits the category and shows it under its new name', async () => {
    await (await categoryCard('Poste e2e').$('[data-testid="category-edit"]')).click();

    await (await $('[data-testid="category-name"]')).setValue('Poste e2e modifié');
    await (await $('[data-testid="category-save"]')).click();

    await expect(categoryCard('Poste e2e modifié')).toExist();
    await expect(categoryCard('Poste e2e')).not.toExist();
  });

  it('deletes the unused category behind a confirmation naming it', async () => {
    await (await categoryCard('Poste e2e modifié').$('[data-testid="category-delete"]')).click();

    const dialog = $('app-confirm-dialog');
    await expect(dialog).toHaveText('Poste e2e modifié', { containing: true });
    await expect(dialog).toHaveText('aucune écriture', { containing: true });
    await (await $('[data-testid="confirm-accept"]')).click();

    await expect(categoryCard('Poste e2e modifié')).not.toExist();
  });

  describe('a category an entry references', () => {
    before(async () => {
      await (await $('[data-testid="category-create"]')).click();
      await (await $('[data-testid="category-name"]')).setValue('Poste utilisé e2e');
      await (await $('[data-testid="icon-option"]')).click();
      await (await $('[data-testid="category-save"]')).click();
      await expect(categoryCard('Poste utilisé e2e')).toExist();

      await (await $('[data-testid="sidebar-home"]')).click();
      await (await $('[data-testid="new-account-header"]')).click();
      await (await $('[data-testid="account-name"]')).setValue('Compte postes e2e');
      await (await $('[data-testid="account-opening-balance"]')).setValue('100');
      await (await $('[data-testid="account-save"]')).click();
      await (await accountCard('Compte postes e2e').$('[data-testid="account-link"]')).click();

      await (await $('[data-testid="entries-new"]')).click();
      await (await $('[data-testid="entry-form-label"]')).setValue('Écriture classée e2e');
      await (await $('[data-testid="entry-form-amount"]')).setValue('-20');
      await (
        await $('[data-testid="entry-form-category"]')
      ).selectByVisibleText('Poste utilisé e2e');
      await (await $('[data-testid="entry-save"]')).click();
      await expect(entryRow('Écriture classée e2e')).toExist();

      await (await $('[data-testid="sidebar-settings"]')).click();
      await expect(categoryCard('Poste utilisé e2e')).toExist();
    });

    it('cannot be deleted, and the refusal says how many entries use it', async () => {
      await (await categoryCard('Poste utilisé e2e').$('[data-testid="category-delete"]')).click();

      const blocked = $('[data-testid="delete-blocked-message"]');
      await expect(blocked).toHaveText('Poste utilisé e2e', { containing: true });
      await expect(blocked).toHaveText('1 écriture', { containing: true });

      await (await $('[data-testid="delete-blocked-dismiss"]')).click();
      await expect(categoryCard('Poste utilisé e2e')).toExist();
    });
  });
});
