import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Account, AccountInput } from '@data/accounts/accounts-api';
import { accountFixture as account } from '@core/testing/account.fixture';
import { COLOR_SWATCHES } from '@shared/pickers/color-swatches';
import { AccountSettingsModal } from './account-settings-modal';

async function createModal(
  editing: Account | null = null,
): Promise<ComponentFixture<AccountSettingsModal>> {
  await TestBed.configureTestingModule({
    imports: [AccountSettingsModal],
  }).compileComponents();

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

async function trySave(fixture: ComponentFixture<unknown>): Promise<void> {
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
      const fixture = await createModal();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nouveau compte');
      expect(element<HTMLInputElement>(fixture, 'account-created-date').value).toBe(isoToday());
    });

    it('submits what was typed as the input the container should save', async () => {
      const fixture = await createModal();
      const submitted: AccountInput[] = [];
      fixture.componentInstance.submitted.subscribe((input) => submitted.push(input));

      type(fixture, 'account-name', 'Compte courant');
      type(fixture, 'account-opening-balance', '1234.56');
      type(fixture, 'account-created-date', '2026-02-01');
      await trySave(fixture);

      expect(submitted).toEqual([
        {
          name: 'Compte courant',
          color: '#3b82f6',
          icon: 'lucideWallet',
          created_date: '2026-02-01',
          opening_balance: 1234.56,
        },
      ]);
    });

    it('sends the typed opening balance untouched, without converting it to cents', async () => {
      const fixture = await createModal();
      const submitted: AccountInput[] = [];
      fixture.componentInstance.submitted.subscribe((input) => submitted.push(input));

      type(fixture, 'account-name', 'Compte courant');
      type(fixture, 'account-opening-balance', '1234.56');
      await trySave(fixture);

      expect(submitted[0].opening_balance).toBe(1234.56);
    });

    it('accepts a negative opening balance, since an account can open overdrawn', async () => {
      const fixture = await createModal();
      const submitted: AccountInput[] = [];
      fixture.componentInstance.submitted.subscribe((input) => submitted.push(input));

      type(fixture, 'account-name', 'Compte courant');
      type(fixture, 'account-opening-balance', '-250');
      await trySave(fixture);

      expect(submitted[0].opening_balance).toBe(-250);
    });

    it('accepts the fr-FR decimal comma the same as a dot', async () => {
      const fixture = await createModal();
      const submitted: AccountInput[] = [];
      fixture.componentInstance.submitted.subscribe((input) => submitted.push(input));

      type(fixture, 'account-name', 'Compte courant');
      type(fixture, 'account-opening-balance', '1234,56');
      await trySave(fixture);

      expect(submitted[0].opening_balance).toBe(1234.56);
    });

    it('passes the icon and colour chosen from the shared pickers', async () => {
      const fixture = await createModal();
      const submitted: AccountInput[] = [];
      fixture.componentInstance.submitted.subscribe((input) => submitted.push(input));

      type(fixture, 'account-name', 'Livret A');
      nth<HTMLButtonElement>(fixture, 'color-swatch', 1).click();
      nth<HTMLButtonElement>(fixture, 'icon-option', 1).click();
      fixture.detectChanges();
      await trySave(fixture);

      expect(submitted[0].color).toBe(COLOR_SWATCHES[1].value);
      expect(submitted[0].icon).toBe('lucideLandmark');
    });
  });

  describe('edit mode', () => {
    it('titles itself as settings and fills the form from the account', async () => {
      const fixture = await createModal(account({ name: 'Livret A', opening_balance: 1234.56 }));

      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Paramètres du compte');
      expect(element<HTMLInputElement>(fixture, 'account-name').value).toBe('Livret A');
      // Not "1234.56": the field edits in the same fr-FR comma notation it
      // was created in, matching the entry amount field.
      expect(element<HTMLInputElement>(fixture, 'account-opening-balance').value).toBe('1234,56');
      expect(element<HTMLInputElement>(fixture, 'account-created-date').value).toBe('2026-01-15');
    });

    it('submits the typed changes without saying which account they belong to', async () => {
      const fixture = await createModal(account({ id: 7 }));
      const submitted: AccountInput[] = [];
      fixture.componentInstance.submitted.subscribe((input) => submitted.push(input));

      type(fixture, 'account-name', 'Livret jeune');
      await trySave(fixture);

      expect(submitted).toEqual([expect.objectContaining({ name: 'Livret jeune' })]);
    });
  });

  describe('validation', () => {
    it('refuses to submit a blank name and says so inline', async () => {
      const fixture = await createModal();
      const submitted: AccountInput[] = [];
      fixture.componentInstance.submitted.subscribe((input) => submitted.push(input));

      type(fixture, 'account-name', '   ');
      await trySave(fixture);

      expect(submitted).toEqual([]);
      expect(element(fixture, 'account-name-error').textContent).toContain('obligatoire');
    });

    it('refuses to submit without an opening balance and says so inline', async () => {
      const fixture = await createModal();
      const submitted: AccountInput[] = [];
      fixture.componentInstance.submitted.subscribe((input) => submitted.push(input));

      type(fixture, 'account-name', 'Compte courant');
      type(fixture, 'account-opening-balance', '');
      await trySave(fixture);

      expect(submitted).toEqual([]);
      expect(has(fixture, 'account-opening-balance-error')).toBe(true);
    });

    it('shows no error before anything has been touched or submitted', async () => {
      const fixture = await createModal();

      expect(has(fixture, 'account-name-error')).toBe(false);
    });
  });

  it('disables the save button while the container is saving', async () => {
    const fixture = await createModal();
    fixture.componentRef.setInput('saving', true);
    fixture.detectChanges();

    expect(element<HTMLButtonElement>(fixture, 'account-save').disabled).toBe(true);
  });

  it('cancels without submitting anything', async () => {
    const fixture = await createModal();
    let cancelled = 0;
    const submitted: AccountInput[] = [];
    fixture.componentInstance.cancelled.subscribe(() => (cancelled += 1));
    fixture.componentInstance.submitted.subscribe((input) => submitted.push(input));

    element<HTMLButtonElement>(fixture, 'account-cancel').click();

    expect(cancelled).toBe(1);
    expect(submitted).toEqual([]);
  });

  it('renders no delete action — deleting only happens from the archived view', async () => {
    const fixture = await createModal(account());

    expect(has(fixture, 'account-delete')).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Supprimer');
  });
});
