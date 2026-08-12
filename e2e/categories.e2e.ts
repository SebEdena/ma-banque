import { $ } from '@wdio/globals';

import { categoryCard } from './support/categories';
import { ensureRoutedShell } from './support/routed-shell';

// The blocked-with-count delete path is not covered here: it needs a category
// an entry actually references, and no entry-creation command exists yet.
// `06-entries.md` inherits it (see `.scratch/categories/notes.md`).
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
});
