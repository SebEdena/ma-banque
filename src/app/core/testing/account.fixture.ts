import { Account } from '../accounts-api/accounts-api';

/**
 * Canonical `Account` shape shared by every spec that needs one, and by
 * `InMemoryAccountsApi`'s seed data — one definition instead of the
 * near-identical local `account()` helpers this replaces (`home.spec.ts`,
 * `accounts-store.spec.ts`, `account-settings-modal.spec.ts`). Lives under
 * `core/testing/` (not inside `accounts-api/`) since it's consumed by specs
 * in several unrelated feature folders.
 */
export function accountFixture(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    name: 'Compte courant',
    color: '#3b82f6',
    icon: 'lucideWallet',
    created_date: '2026-01-15',
    opening_balance: 1000,
    balance: 1234.56,
    archived: false,
    last_entry_date: '2026-03-05',
    ...overrides,
  };
}
