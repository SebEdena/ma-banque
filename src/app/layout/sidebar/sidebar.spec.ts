import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Account, AccountsApi } from '@data/accounts/accounts-api';
import { AccountsStore } from '@data/accounts/accounts-store';
import { Sidebar } from './sidebar';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    name: 'Compte courant',
    color: '#3b82f6',
    icon: 'lucideWallet',
    created_date: '2026-01-15',
    opening_balance: 0,
    balance: 0,
    archived: false,
    last_entry_date: null,
    ...overrides,
  };
}

async function createSidebar(
  active: Account[],
  archived: Account[] = [],
): Promise<ComponentFixture<Sidebar>> {
  await TestBed.configureTestingModule({
    imports: [Sidebar],
    providers: [
      provideRouter([]),
      {
        provide: AccountsApi,
        useValue: {
          listActiveAccounts: vi.fn().mockResolvedValue(active),
          listArchivedAccounts: vi.fn().mockResolvedValue(archived),
        },
      },
    ],
  }).compileComponents();

  await TestBed.inject(AccountsStore).loaded;

  const fixture = TestBed.createComponent(Sidebar);
  fixture.detectChanges();
  return fixture;
}

function rail(fixture: ComponentFixture<Sidebar>): HTMLAnchorElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="sidebar-account"]'),
  );
}

describe('Sidebar', () => {
  it('shows one rail entry per active account, linking to it', async () => {
    const fixture = await createSidebar([
      account({ id: 1, name: 'Compte courant' }),
      account({ id: 2, name: 'Livret A' }),
    ]);

    expect(rail(fixture)).toHaveLength(2);
    expect(rail(fixture)[1].getAttribute('href')).toBe('/account/2');
    expect(rail(fixture)[1].getAttribute('aria-label')).toBe('Livret A');
  });

  it('leaves archived accounts out of the rail, like the home screen does', async () => {
    const fixture = await createSidebar(
      [account({ id: 1 })],
      [account({ id: 2, name: 'Vieux PEL', archived: true })],
    );

    expect(rail(fixture).map((link) => link.dataset['accountId'])).toEqual(['1']);
  });

  it('always offers home and settings', async () => {
    const fixture = await createSidebar([]);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="sidebar-home"]')?.getAttribute('href')).toBe(
      '/home',
    );
    expect(compiled.querySelector('[data-testid="sidebar-settings"]')?.getAttribute('href')).toBe(
      '/settings',
    );
  });
});
