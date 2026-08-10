import { Service, inject, signal } from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';

import { Account, AccountsApi, parseAccountError } from './accounts-api';

/**
 * Signal-backed source of truth for the account lists, shared by every
 * surface that shows them — the home screen's cards and the sidebar's
 * account rail today. Both read the same signals rather than fetching
 * independently, which is what keeps the two navigation surfaces from ever
 * disagreeing (`docs/spec/03-accounts.md`, user story 20).
 *
 * Mutations go through here too, so a change made on one surface is
 * reflected on the other without either knowing the other exists.
 */
@Service()
export class AccountsStore {
  private readonly accountsApi = inject(AccountsApi);

  private readonly activeSignal = signal<Account[]>([]);
  private readonly archivedSignal = signal<Account[]>([]);

  readonly active = this.activeSignal.asReadonly();
  readonly archived = this.archivedSignal.asReadonly();

  /**
   * Resolves once the initial load has settled, success or failure — exposed
   * so callers (and tests) can wait deterministically rather than guessing
   * how many microtasks the internal promise chain takes, matching
   * `DisplaySettingsService.loaded`.
   */
  readonly loaded: Promise<void>;

  constructor() {
    this.loaded = this.reload().catch((error: unknown) => {
      console.error('failed to load accounts', error);
      toast.error(parseAccountError(error));
    });
  }

  /** Refetches both lists. Rejects with the raw `AccountError` for the caller to toast. */
  async reload(): Promise<void> {
    const [active, archived] = await Promise.all([
      this.accountsApi.listActiveAccounts(),
      this.accountsApi.listArchivedAccounts(),
    ]);

    this.activeSignal.set(active);
    this.archivedSignal.set(archived);
  }

  async archive(id: number): Promise<void> {
    await this.accountsApi.archiveAccount(id);
    await this.reload();
  }
}
