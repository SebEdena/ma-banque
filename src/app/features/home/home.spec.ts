import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';

import { Account, AccountsApi } from '@data/accounts/accounts-api';
import { AccountsStore } from '@data/accounts/accounts-store';
import { accountFixture as account } from '@core/testing/account.fixture';
import { DisplaySettingsService } from '@core/display-settings/display-settings';
import { Home } from './home';

function stubApi(
  active: Account[],
  archived: Account[] = [],
  overrides: Partial<AccountsApi> = {},
): Partial<AccountsApi> {
  return {
    listActiveAccounts: vi.fn().mockResolvedValue(active),
    listArchivedAccounts: vi.fn().mockResolvedValue(archived),
    createAccount: vi.fn().mockResolvedValue(account()),
    updateAccount: vi.fn().mockResolvedValue(account()),
    archiveAccount: vi.fn().mockResolvedValue(undefined),
    unarchiveAccount: vi.fn().mockResolvedValue(undefined),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function click(fixture: ComponentFixture<Home>, testId: string): void {
  (
    (fixture.nativeElement as HTMLElement).querySelector(
      `[data-testid="${testId}"]`,
    ) as HTMLButtonElement
  ).click();
}

function has(fixture: ComponentFixture<Home>, testId: string): boolean {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`) !== null;
}

async function createHome(accountsApi: Partial<AccountsApi>): Promise<ComponentFixture<Home>> {
  await TestBed.configureTestingModule({
    imports: [Home],
    providers: [
      provideRouter([]),
      { provide: AccountsApi, useValue: accountsApi },
      {
        provide: DisplaySettingsService,
        useValue: { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER') },
      },
    ],
  }).compileComponents();

  await TestBed.inject(AccountsStore).loaded;

  const fixture = TestBed.createComponent(Home);
  fixture.detectChanges();
  return fixture;
}

function cards(fixture: ComponentFixture<Home>): HTMLElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="account-card"]'),
  );
}

function textOf(fixture: ComponentFixture<Home>, testId: string): string {
  return (
    (fixture.nativeElement as HTMLElement)
      .querySelector(`[data-testid="${testId}"]`)
      ?.textContent?.trim() ?? ''
  );
}

async function toggleArchived(fixture: ComponentFixture<Home>): Promise<void> {
  (
    (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="archived-toggle"]',
    ) as HTMLButtonElement
  ).click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('Home', () => {
  it('renders one card per active account', async () => {
    const fixture = await createHome(
      stubApi([account({ id: 1, name: 'Compte courant' }), account({ id: 2, name: 'Livret A' })]),
    );

    expect(cards(fixture)).toHaveLength(2);
    expect(cards(fixture)[1].textContent).toContain('Livret A');
  });

  it("renders each card's balance and last-entry date using the display settings", async () => {
    const fixture = await createHome(stubApi([account()]));

    expect(textOf(fixture, 'account-balance')).toMatch(/234,56\s€$/);
    expect(textOf(fixture, 'account-last-entry')).toContain('05/03/2026');
  });

  it('says so rather than showing a date when an account has no entries', async () => {
    const fixture = await createHome(stubApi([account({ last_entry_date: null })]));

    expect(textOf(fixture, 'account-last-entry')).toBe('Aucune écriture');
  });

  it('shows no reconciliation indicator, per the spec decision against one', async () => {
    const fixture = await createHome(stubApi([account()]));

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="reconciliation"]'),
    ).toBeNull();
  });

  it('links each card to its account', async () => {
    const fixture = await createHome(stubApi([account({ id: 7 })]));

    const link = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="account-link"]',
    );
    expect(link?.getAttribute('href')).toBe('/account/7');
  });

  it('hides archived accounts behind a count', async () => {
    const fixture = await createHome(
      stubApi(
        [account({ id: 1, name: 'Compte courant' })],
        [account({ id: 2, name: 'Vieux PEL' })],
      ),
    );

    expect(cards(fixture)).toHaveLength(1);
    expect(cards(fixture)[0].textContent).toContain('Compte courant');
    expect(textOf(fixture, 'archived-toggle')).toContain('Comptes archivés (1)');
  });

  it('switches the list to archived accounts and back', async () => {
    const fixture = await createHome(
      stubApi(
        [account({ id: 1, name: 'Compte courant' })],
        [account({ id: 2, name: 'Vieux PEL' })],
      ),
    );

    await toggleArchived(fixture);
    expect(cards(fixture)).toHaveLength(1);
    expect(cards(fixture)[0].textContent).toContain('Vieux PEL');

    await toggleArchived(fixture);
    expect(cards(fixture)[0].textContent).toContain('Compte courant');
  });

  it('offers no archived toggle when nothing is archived', async () => {
    const fixture = await createHome(stubApi([account()]));

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="archived-toggle"]'),
    ).toBeNull();
  });

  it('archives an account from its card and refreshes the lists', async () => {
    const accountsApi = stubApi([account({ id: 3 })]);
    const fixture = await createHome(accountsApi);

    (
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="archive-account"]',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();

    expect(accountsApi.archiveAccount).toHaveBeenCalledWith(3);
    expect(accountsApi.listActiveAccounts).toHaveBeenCalledTimes(2);
  });

  it('offers no archive action on an already-archived card', async () => {
    const fixture = await createHome(stubApi([], [account({ id: 2, archived: true })]));
    await toggleArchived(fixture);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="archive-account"]'),
    ).toBeNull();
  });

  it('says so when there are no archived accounts to show', async () => {
    const fixture = await createHome(stubApi([account()], [account({ id: 2 })]));
    await toggleArchived(fixture);
    await toggleArchived(fixture);

    expect(cards(fixture)).toHaveLength(1);
  });

  it('offers the new-account card, and only in the active view', async () => {
    const fixture = await createHome(stubApi([], [account({ id: 2 })]));

    expect(textOf(fixture, 'new-account')).toContain('Nouveau compte');

    await toggleArchived(fixture);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="new-account"]'),
    ).toBeNull();
  });

  it('opens the settings modal in create mode from the new-account card', async () => {
    const fixture = await createHome(stubApi([]));
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('app-account-settings-modal')).toBeNull();

    (compiled.querySelector('[data-testid="new-account"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(compiled.querySelector('app-account-settings-modal')).not.toBeNull();
    expect(compiled.textContent).toContain('Nouveau compte');
  });

  it('creates the account the modal submitted and closes the modal', async () => {
    const accountsApi = stubApi([], [], { createAccount: vi.fn().mockResolvedValue(account()) });
    const fixture = await createHome(accountsApi);
    const compiled = fixture.nativeElement as HTMLElement;

    click(fixture, 'new-account');
    fixture.detectChanges();
    const name = compiled.querySelector('[data-testid="account-name"]') as HTMLInputElement;
    name.value = 'Compte courant';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click(fixture, 'account-save');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(accountsApi.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Compte courant' }),
    );
    expect(compiled.querySelector('app-account-settings-modal')).toBeNull();
  });

  it('opens the settings modal in edit mode, pre-filled, from the card', async () => {
    const fixture = await createHome(stubApi([account({ id: 4, name: 'Livret A' })]));
    const compiled = fixture.nativeElement as HTMLElement;

    click(fixture, 'edit-account');
    fixture.detectChanges();

    const name = compiled.querySelector('[data-testid="account-name"]') as HTMLInputElement;
    expect(name.value).toBe('Livret A');
    expect(compiled.textContent).toContain('Paramètres du compte');
  });

  it('updates, not creates, the account edited from the card', async () => {
    const accountsApi = stubApi([account({ id: 4, name: 'Livret A' })], [], {
      updateAccount: vi.fn().mockResolvedValue(account({ id: 4 })),
    });
    const fixture = await createHome(accountsApi);
    const compiled = fixture.nativeElement as HTMLElement;

    click(fixture, 'edit-account');
    fixture.detectChanges();
    const name = compiled.querySelector('[data-testid="account-name"]') as HTMLInputElement;
    name.value = 'Livret A renommé';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click(fixture, 'account-save');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(accountsApi.updateAccount).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ name: 'Livret A renommé' }),
    );
    expect(accountsApi.createAccount).not.toHaveBeenCalled();
    expect(compiled.querySelector('app-account-settings-modal')).toBeNull();
  });

  it('offers no edit action on an archived card', async () => {
    const fixture = await createHome(stubApi([], [account({ id: 2, archived: true })]));
    await toggleArchived(fixture);

    expect(has(fixture, 'edit-account')).toBe(false);
  });

  it('keeps the modal open and toasts when the create is rejected', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '');
    const accountsApi = stubApi([], [], {
      createAccount: vi.fn().mockRejectedValue({ kind: 'OpeningDateNotBeforeFirstEntry' }),
    });
    const fixture = await createHome(accountsApi);
    const compiled = fixture.nativeElement as HTMLElement;

    click(fixture, 'new-account');
    fixture.detectChanges();
    const name = compiled.querySelector('[data-testid="account-name"]') as HTMLInputElement;
    name.value = 'Compte courant';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click(fixture, 'account-save');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelector('app-account-settings-modal')).not.toBeNull();
    expect(error).toHaveBeenCalled();
  });

  it('no longer shows the temporary data-folder proof', async () => {
    const fixture = await createHome(stubApi([account()]));
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="demo-date"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="demo-amount"]')).toBeNull();
  });

  describe('archived view', () => {
    async function createArchivedView(
      overrides: Partial<AccountsApi> = {},
    ): Promise<[ComponentFixture<Home>, Partial<AccountsApi>]> {
      const accountsApi = stubApi(
        [],
        [account({ id: 9, name: 'Vieux PEL', archived: true })],
        overrides,
      );
      const fixture = await createHome(accountsApi);
      await toggleArchived(fixture);
      return [fixture, accountsApi];
    }

    it('restores an archived account', async () => {
      const [fixture, accountsApi] = await createArchivedView();

      click(fixture, 'restore-account');
      await fixture.whenStable();

      expect(accountsApi.unarchiveAccount).toHaveBeenCalledWith(9);
    });

    it('asks for confirmation, naming the account, before deleting anything', async () => {
      const [fixture, accountsApi] = await createArchivedView();

      click(fixture, 'delete-account');
      fixture.detectChanges();
      await fixture.whenStable();

      expect(accountsApi.deleteAccount).not.toHaveBeenCalled();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('app-confirm-dialog')?.textContent,
      ).toContain('Vieux PEL');
    });

    it('deletes only once the confirmation is accepted', async () => {
      const [fixture, accountsApi] = await createArchivedView();
      click(fixture, 'delete-account');
      fixture.detectChanges();

      click(fixture, 'confirm-accept');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(accountsApi.deleteAccount).toHaveBeenCalledWith(9);
      expect(has(fixture, 'confirm-accept')).toBe(false);
    });

    it('deletes nothing when the confirmation is dismissed', async () => {
      const [fixture, accountsApi] = await createArchivedView();
      click(fixture, 'delete-account');
      fixture.detectChanges();

      click(fixture, 'confirm-cancel');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(accountsApi.deleteAccount).not.toHaveBeenCalled();
      expect(has(fixture, 'confirm-accept')).toBe(false);
    });

    it('survives a delete the backend refuses', async () => {
      const [fixture, accountsApi] = await createArchivedView({
        deleteAccount: vi.fn().mockRejectedValue({ kind: 'HasNonSystemEntries' }),
      });
      click(fixture, 'delete-account');
      fixture.detectChanges();

      click(fixture, 'confirm-accept');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(accountsApi.deleteAccount).toHaveBeenCalledWith(9);
      expect(cards(fixture)).toHaveLength(1);
    });

    it('offers neither restore nor delete on an active card', async () => {
      const fixture = await createHome(stubApi([account({ id: 1 })]));

      expect(has(fixture, 'restore-account')).toBe(false);
      expect(has(fixture, 'delete-account')).toBe(false);
    });
  });
});
