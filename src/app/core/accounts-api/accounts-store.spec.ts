import { TestBed } from '@angular/core/testing';

import { Account, AccountsApi } from './accounts-api';
import { AccountsStore } from './accounts-store';

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

function createStore(accountsApi: Partial<AccountsApi>): AccountsStore {
  TestBed.configureTestingModule({
    providers: [{ provide: AccountsApi, useValue: accountsApi }],
  });
  return TestBed.inject(AccountsStore);
}

describe('AccountsStore', () => {
  it('loads both lists on construction', async () => {
    const store = createStore({
      listActiveAccounts: vi.fn().mockResolvedValue([account({ id: 1 })]),
      listArchivedAccounts: vi.fn().mockResolvedValue([account({ id: 2, archived: true })]),
    });

    await store.loaded;

    expect(store.active().map((a) => a.id)).toEqual([1]);
    expect(store.archived().map((a) => a.id)).toEqual([2]);
  });

  it('leaves both lists empty when the initial load fails', async () => {
    const store = createStore({
      listActiveAccounts: vi.fn().mockRejectedValue({ kind: 'Io', message: 'boom' }),
      listArchivedAccounts: vi.fn().mockResolvedValue([]),
    });

    await store.loaded;

    expect(store.active()).toEqual([]);
    expect(store.archived()).toEqual([]);
  });

  it('refetches both lists after archiving, so every surface sees the move', async () => {
    const listActiveAccounts = vi
      .fn()
      .mockResolvedValueOnce([account({ id: 1 })])
      .mockResolvedValueOnce([]);
    const listArchivedAccounts = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([account({ id: 1, archived: true })]);
    const store = createStore({
      listActiveAccounts,
      listArchivedAccounts,
      archiveAccount: vi.fn().mockResolvedValue(undefined),
    });
    await store.loaded;

    await store.archive(1);

    expect(store.active()).toEqual([]);
    expect(store.archived().map((a) => a.id)).toEqual([1]);
  });

  it('refetches both lists after restoring and after deleting', async () => {
    const accountsApi = {
      listActiveAccounts: vi.fn().mockResolvedValue([]),
      listArchivedAccounts: vi.fn().mockResolvedValue([]),
      unarchiveAccount: vi.fn().mockResolvedValue(undefined),
      deleteAccount: vi.fn().mockResolvedValue(undefined),
    };
    const store = createStore(accountsApi);
    await store.loaded;

    await store.unarchive(1);
    await store.delete(1);

    expect(accountsApi.unarchiveAccount).toHaveBeenCalledWith(1);
    expect(accountsApi.deleteAccount).toHaveBeenCalledWith(1);
    expect(accountsApi.listArchivedAccounts).toHaveBeenCalledTimes(3);
  });

  it('propagates a refused delete, so the caller can surface the guard', async () => {
    const store = createStore({
      listActiveAccounts: vi.fn().mockResolvedValue([]),
      listArchivedAccounts: vi.fn().mockResolvedValue([]),
      deleteAccount: vi.fn().mockRejectedValue({ kind: 'HasNonSystemEntries' }),
    });
    await store.loaded;

    await expect(store.delete(1)).rejects.toEqual({ kind: 'HasNonSystemEntries' });
  });

  it('propagates an archive failure instead of swallowing it', async () => {
    const store = createStore({
      listActiveAccounts: vi.fn().mockResolvedValue([]),
      listArchivedAccounts: vi.fn().mockResolvedValue([]),
      archiveAccount: vi.fn().mockRejectedValue({ kind: 'NotFound' }),
    });
    await store.loaded;

    await expect(store.archive(1)).rejects.toEqual({ kind: 'NotFound' });
  });
});
