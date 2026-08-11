import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Account, AccountsApi } from '@core/accounts-api/accounts-api';
import { AccountsStore } from '@core/accounts-api/accounts-store';
import { accountFixture as account } from '@core/testing/account.fixture';
import { AccountSettingsModal } from './account-settings-modal';

function stubApi(overrides: Partial<AccountsApi> = {}): Partial<AccountsApi> {
  return {
    listActiveAccounts: vi.fn().mockResolvedValue([]),
    listArchivedAccounts: vi.fn().mockResolvedValue([]),
    createAccount: vi.fn().mockResolvedValue(account()),
    updateAccount: vi.fn().mockResolvedValue(account()),
    ...overrides,
  };
}

async function createModal(
  accountsApi: Partial<AccountsApi>,
  editing: Account | null = null,
): Promise<ComponentFixture<AccountSettingsModal>> {
  await TestBed.configureTestingModule({
    imports: [AccountSettingsModal],
    providers: [{ provide: AccountsApi, useValue: accountsApi }],
  }).compileComponents();

  await TestBed.inject(AccountsStore).loaded;

  const fixture = TestBed.createComponent(AccountSettingsModal);
  fixture.componentRef.setInput('account', editing);
  fixture.detectChanges();
  return fixture;
}

function element<T extends HTMLElement>(fixture: ComponentFixture<unknown>, testId: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`) as T;
}

function nth<T extends HTMLElement>(
  fixture: ComponentFixture<unknown>,
  testId: string,
  index: number,
): T {
  return (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`)[
    index
  ] as T;
}

function has(fixture: ComponentFixture<unknown>, testId: string): boolean {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`) !== null;
}

function type(fixture: ComponentFixture<unknown>, testId: string, value: string): void {
  const input = element<HTMLInputElement>(fixture, testId);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function save(fixture: ComponentFixture<unknown>): Promise<void> {
  element<HTMLButtonElement>(fixture, 'account-save').click();
  await fixture.whenStable();
  fixture.detectChanges();
}

function isoToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

describe('AccountSettingsModal', () => {
  describe('create mode', () => {
    it('titles itself as a new account and defaults the opening date to today', async () => {
      const fixture = await createModal(stubApi());

      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nouveau compte');
      expect(element<HTMLInputElement>(fixture, 'account-created-date').value).toBe(isoToday());
    });

    it('creates the account from what was typed and reports it back', async () => {
      const accountsApi = stubApi();
      const fixture = await createModal(accountsApi);
      const saved: Account[] = [];
      fixture.componentInstance.saved.subscribe((a) => saved.push(a));

      type(fixture, 'account-name', 'Compte courant');
      type(fixture, 'account-opening-balance', '1234.56');
      type(fixture, 'account-created-date', '2026-02-01');
      await save(fixture);

      expect(accountsApi.createAccount).toHaveBeenCalledWith({
        name: 'Compte courant',
        color: '#3b82f6',
        icon: 'lucideWallet',
        created_date: '2026-02-01',
        opening_balance: 1234.56,
      });
      expect(saved).toHaveLength(1);
    });

    it('sends the typed opening balance untouched, without converting it to cents', async () => {
      const accountsApi = stubApi();
      const fixture = await createModal(accountsApi);

      type(fixture, 'account-name', 'Compte courant');
      type(fixture, 'account-opening-balance', '1234.56');
      await save(fixture);

      expect(vi.mocked(accountsApi.createAccount!).mock.calls[0][0].opening_balance).toBe(1234.56);
    });

    it('accepts a negative opening balance, since an account can open overdrawn', async () => {
      const accountsApi = stubApi();
      const fixture = await createModal(accountsApi);

      type(fixture, 'account-name', 'Compte courant');
      type(fixture, 'account-opening-balance', '-250');
      await save(fixture);

      expect(vi.mocked(accountsApi.createAccount!).mock.calls[0][0].opening_balance).toBe(-250);
    });

    it('passes the icon and colour chosen from the shared pickers', async () => {
      const accountsApi = stubApi();
      const fixture = await createModal(accountsApi);

      type(fixture, 'account-name', 'Livret A');
      nth<HTMLButtonElement>(fixture, 'color-swatch', 1).click();
      nth<HTMLButtonElement>(fixture, 'icon-option', 1).click();
      fixture.detectChanges();
      await save(fixture);

      const input = vi.mocked(accountsApi.createAccount!).mock.calls[0][0];
      expect(input.color).toBe('#06b6d4');
      expect(input.icon).toBe('lucideLandmark');
    });
  });

  describe('edit mode', () => {
    it('titles itself as settings and fills the form from the account', async () => {
      const fixture = await createModal(
        stubApi(),
        account({ name: 'Livret A', opening_balance: 1234.56 }),
      );

      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Paramètres du compte');
      expect(element<HTMLInputElement>(fixture, 'account-name').value).toBe('Livret A');
      expect(element<HTMLInputElement>(fixture, 'account-opening-balance').value).toBe('1234.56');
      expect(element<HTMLInputElement>(fixture, 'account-created-date').value).toBe('2026-01-15');
    });

    it('updates the account it was given rather than creating one', async () => {
      const accountsApi = stubApi();
      const fixture = await createModal(accountsApi, account({ id: 7 }));

      type(fixture, 'account-name', 'Livret jeune');
      await save(fixture);

      expect(accountsApi.updateAccount).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ name: 'Livret jeune' }),
      );
      expect(accountsApi.createAccount).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('refuses to save a blank name and says so inline', async () => {
      const accountsApi = stubApi();
      const fixture = await createModal(accountsApi);

      type(fixture, 'account-name', '   ');
      await save(fixture);

      expect(accountsApi.createAccount).not.toHaveBeenCalled();
      expect(element(fixture, 'account-name-error').textContent).toContain('obligatoire');
    });

    it('refuses to save without an opening balance and says so inline', async () => {
      const accountsApi = stubApi();
      const fixture = await createModal(accountsApi);

      type(fixture, 'account-name', 'Compte courant');
      type(fixture, 'account-opening-balance', '');
      await save(fixture);

      expect(accountsApi.createAccount).not.toHaveBeenCalled();
      expect(has(fixture, 'account-opening-balance-error')).toBe(true);
    });

    it('shows no error before anything has been touched or submitted', async () => {
      const fixture = await createModal(stubApi());

      expect(has(fixture, 'account-name-error')).toBe(false);
    });
  });

  it('reports a rejected save as an error rather than closing', async () => {
    const accountsApi = stubApi({
      createAccount: vi.fn().mockRejectedValue({ kind: 'OpeningDateNotBeforeFirstEntry' }),
    });
    const fixture = await createModal(accountsApi);
    const saved: Account[] = [];
    fixture.componentInstance.saved.subscribe((a) => saved.push(a));

    type(fixture, 'account-name', 'Compte courant');
    await save(fixture);

    expect(saved).toEqual([]);
  });

  it('cancels without calling anything', async () => {
    const accountsApi = stubApi();
    const fixture = await createModal(accountsApi);
    let cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => (cancelled += 1));

    element<HTMLButtonElement>(fixture, 'account-cancel').click();

    expect(cancelled).toBe(1);
    expect(accountsApi.createAccount).not.toHaveBeenCalled();
    expect(accountsApi.updateAccount).not.toHaveBeenCalled();
  });

  it('renders no delete action — deleting only happens from the archived view', async () => {
    const fixture = await createModal(stubApi(), account());

    expect(has(fixture, 'account-delete')).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Supprimer');
  });
});
