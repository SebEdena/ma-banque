import { ComponentFixture, TestBed } from '@angular/core/testing';

import { accountFixture as account } from '@core/testing/account.fixture';
import '@core/testing/jsdom-polyfills';
import { AccountPills } from './account-pills';

function one(fixture: ComponentFixture<AccountPills>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

function all(fixture: ComponentFixture<AccountPills>, testId: string): HTMLElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`),
  );
}

describe('AccountPills', () => {
  it('renders one pill per account, carrying its own colour', () => {
    const accounts = [
      account({ id: 1, name: 'Compte Courant', color: '#3b82f6' }),
      account({ id: 2, name: 'Livret A', color: '#10b981' }),
    ];
    const fixture = TestBed.createComponent(AccountPills);
    fixture.componentRef.setInput('accounts', accounts);
    fixture.componentRef.setInput('selectedAccountId', 1);
    fixture.detectChanges();

    const pills = all(fixture, 'account-pill-1').concat(all(fixture, 'account-pill-2'));
    expect(pills).toHaveLength(2);
    expect(one(fixture, 'account-pill-2')?.textContent).toContain('Livret A');
  });

  it('marks the selected account pill as pressed and leaves the others unpressed', () => {
    const accounts = [
      account({ id: 1, name: 'Compte Courant', color: '#3b82f6' }),
      account({ id: 2, name: 'Livret A', color: '#10b981' }),
    ];
    const fixture = TestBed.createComponent(AccountPills);
    fixture.componentRef.setInput('accounts', accounts);
    fixture.componentRef.setInput('selectedAccountId', 2);
    fixture.detectChanges();

    expect(one(fixture, 'account-pill-1')?.getAttribute('aria-pressed')).toBe('false');
    expect(one(fixture, 'account-pill-2')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('emits the clicked account', () => {
    const accounts = [
      account({ id: 1, name: 'Compte Courant', color: '#3b82f6' }),
      account({ id: 2, name: 'Livret A', color: '#10b981' }),
    ];
    const fixture = TestBed.createComponent(AccountPills);
    fixture.componentRef.setInput('accounts', accounts);
    fixture.componentRef.setInput('selectedAccountId', 1);
    fixture.detectChanges();

    const selected = vi.fn();
    fixture.componentInstance.accountSelected.subscribe(selected);

    one(fixture, 'account-pill-2')!.click();

    expect(selected).toHaveBeenCalledWith(accounts[1]);
  });
});
