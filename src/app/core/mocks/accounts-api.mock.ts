import { Account, AccountInput, AccountsApi } from '@core/accounts-api/accounts-api';
import { accountFixture } from '@core/testing/account.fixture';

/**
 * In-memory stand-in for `AccountsApi`, activated by `--configuration mock`
 * (see `src/app/app.config.ts`) so screens can be exercised in a plain
 * browser via `npm run start:mock`, without a Tauri backend to talk to.
 * Mutates its seed data in place so create/archive/unarchive/delete behave
 * like the real thing across the session, not just on first render.
 */
export class InMemoryAccountsApi implements AccountsApi {
  private nextId = 7;

  private accounts: Account[] = [
    accountFixture({
      id: 1,
      name: 'Compte Courant',
      color: '#6366f1',
      icon: 'lucideCreditCard',
      opening_balance: 500,
      balance: 475.38,
      last_entry_date: '2026-07-31',
    }),
    accountFixture({
      id: 2,
      name: 'Livret A',
      color: '#10b981',
      icon: 'lucidePiggyBank',
      opening_balance: 12000,
      balance: 12300,
      last_entry_date: '2026-07-31',
    }),
    accountFixture({
      id: 3,
      name: 'Compte Joint',
      color: '#ec4899',
      icon: 'lucideCreditCard',
      opening_balance: 0,
      balance: -145.2,
      last_entry_date: '2026-07-29',
    }),
    accountFixture({
      id: 4,
      name: 'Épargne Projet',
      color: '#f59e0b',
      icon: 'lucidePiggyBank',
      opening_balance: 5000,
      balance: 5000,
      last_entry_date: '2026-07-15',
    }),
    accountFixture({
      id: 5,
      name: 'Compte Pro',
      color: '#8b5cf6',
      icon: 'lucideLandmark',
      opening_balance: 3000,
      balance: 3210.55,
      last_entry_date: '2026-07-28',
    }),
    accountFixture({
      id: 6,
      name: 'Vieux Livret',
      color: '#64748b',
      icon: 'lucideBanknote',
      opening_balance: 200,
      balance: 200,
      archived: true,
      last_entry_date: '2025-11-02',
    }),
  ];

  listActiveAccounts(): Promise<Account[]> {
    return Promise.resolve(this.accounts.filter((a) => !a.archived));
  }

  listArchivedAccounts(): Promise<Account[]> {
    return Promise.resolve(this.accounts.filter((a) => a.archived));
  }

  createAccount(input: AccountInput): Promise<Account> {
    const created = accountFixture({
      ...input,
      id: this.nextId++,
      balance: input.opening_balance,
      archived: false,
      last_entry_date: null,
    });
    this.accounts = [...this.accounts, created];
    return Promise.resolve(created);
  }

  updateAccount(id: number, input: AccountInput): Promise<Account> {
    const existing = this.findOrThrow(id);
    const updated: Account = { ...existing, ...input };
    this.accounts = this.accounts.map((a) => (a.id === id ? updated : a));
    return Promise.resolve(updated);
  }

  archiveAccount(id: number): Promise<void> {
    this.setArchived(id, true);
    return Promise.resolve();
  }

  unarchiveAccount(id: number): Promise<void> {
    this.setArchived(id, false);
    return Promise.resolve();
  }

  deleteAccount(id: number): Promise<void> {
    this.findOrThrow(id);
    this.accounts = this.accounts.filter((a) => a.id !== id);
    return Promise.resolve();
  }

  private setArchived(id: number, archived: boolean): void {
    const existing = this.findOrThrow(id);
    this.accounts = this.accounts.map((a) => (a.id === id ? { ...existing, archived } : a));
  }

  private findOrThrow(id: number): Account {
    const account = this.accounts.find((a) => a.id === id);
    if (!account) {
      throw { kind: 'NotFound' };
    }
    return account;
  }
}
