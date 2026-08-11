import { $ } from '@wdio/globals';

import { accountCard } from './support/accounts';
import { ensureRoutedShell } from './support/routed-shell';

describe('accounts', () => {
  before(ensureRoutedShell);

  it('creates an account from the home screen', async () => {
    await (await $('[data-testid="new-account-header"]')).click();

    await (await $('[data-testid="account-name"]')).setValue('Compte e2e');
    await (await $('[data-testid="account-opening-balance"]')).setValue('100');
    await (await $('[data-testid="account-save"]')).click();

    await expect(accountCard('Compte e2e')).toExist();
  });

  it('archives the account and finds it under the archived view', async () => {
    const card = accountCard('Compte e2e');
    await (await card.$('[data-testid="archive-account"]')).click();
    await expect(card).not.toExist();

    await (await $('[data-testid="archived-toggle"]')).click();
    await expect(accountCard('Compte e2e')).toExist();
  });

  it('restores the account back into the active view', async () => {
    const archivedCard = accountCard('Compte e2e');
    await (await archivedCard.$('[data-testid="restore-account"]')).click();
    await expect(archivedCard).not.toExist();

    await (await $('[data-testid="archived-toggle"]')).click();
    await expect(accountCard('Compte e2e')).toExist();
  });

  it('deletes the account behind a confirmation naming it', async () => {
    const card = accountCard('Compte e2e');
    await (await card.$('[data-testid="archive-account"]')).click();

    await (await $('[data-testid="archived-toggle"]')).click();
    const archivedCard = accountCard('Compte e2e');
    await (await archivedCard.$('[data-testid="delete-account"]')).click();

    await expect($('body')).toHaveText('Compte e2e', { containing: true });
    await (await $('[data-testid="confirm-accept"]')).click();

    await expect(accountCard('Compte e2e')).not.toExist();
  });
});
