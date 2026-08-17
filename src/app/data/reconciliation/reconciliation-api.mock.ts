import { ReconciliationApi, ReconciliationSummary } from './reconciliation-api';

/** What an account has stored before the panel is ever used: nothing. */
interface StoredSettings {
  statement_date: string | null;
  bank_balance: number | null;
}

/**
 * In-memory stand-in for `ReconciliationApi`, activated by `--configuration
 * mock` (see `src/app/app.config.ts`) so the panel can be exercised in a
 * plain browser via `npm run start:mock`. Both values start `null`, as they
 * do for a real account that predates the feature, so the set-a-statement-date
 * prompt is what the panel opens on.
 *
 * The reconciled balance is a stand-in figure rather than a sum over
 * `InMemoryEntriesApi`'s seed: the two mocks hold no shared store, and this
 * one only has to make the panel's states reachable by hand.
 */
export class InMemoryReconciliationApi implements ReconciliationApi {
  private static readonly RECONCILED_BALANCE = 475.38;

  private readonly settings = new Map<number, StoredSettings>();

  summary(accountId: number): Promise<ReconciliationSummary> {
    return Promise.resolve(this.summaryFor(accountId));
  }

  setBankBalance(accountId: number, amount: number): Promise<ReconciliationSummary> {
    this.settingsFor(accountId).bank_balance = amount;
    return Promise.resolve(this.summaryFor(accountId));
  }

  setStatementDate(accountId: number, date: string): Promise<ReconciliationSummary> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Promise.reject({ kind: 'InvalidDate', message: date });
    }
    this.settingsFor(accountId).statement_date = date;
    return Promise.resolve(this.summaryFor(accountId));
  }

  private summaryFor(accountId: number): ReconciliationSummary {
    const { statement_date, bank_balance } = this.settingsFor(accountId);
    const reconciled_balance =
      statement_date === null ? null : InMemoryReconciliationApi.RECONCILED_BALANCE;
    const delta =
      bank_balance === null || reconciled_balance === null
        ? null
        : Math.round((bank_balance - reconciled_balance) * 100) / 100;

    return {
      statement_date,
      bank_balance,
      reconciled_balance,
      delta,
      is_balanced: delta === 0,
      unreconciled_count: 160,
    };
  }

  private settingsFor(accountId: number): StoredSettings {
    const existing = this.settings.get(accountId);
    if (existing) {
      return existing;
    }
    const created: StoredSettings = { statement_date: null, bank_balance: null };
    this.settings.set(accountId, created);
    return created;
  }
}
