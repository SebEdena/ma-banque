import { RecurringRule, RecurringRuleInput, RecurringRulesApi } from './recurring-rules-api';

/** Two rules on the seeded current account, so the modal opens onto a list. */
const SEEDED: RecurringRule[] = [
  {
    id: 1,
    account_id: 1,
    label: 'Loyer',
    category_id: 2,
    amount: -750,
    description: 'Studio rue des Lilas',
    frequency: 'MONTHLY',
    interval: 1,
    start_date: '2026-01-05',
    end_date: null,
  },
  {
    id: 2,
    account_id: 1,
    label: 'Assurance habitation',
    category_id: 2,
    amount: -184.5,
    description: '',
    frequency: 'YEARLY',
    interval: 1,
    start_date: '2026-03-01',
    end_date: '2029-03-01',
  },
];

/**
 * In-memory stand-in for `RecurringRulesApi`, activated by `--configuration
 * mock` (see `src/app/app.config.ts`) so the rules modal and the screens that
 * trigger generation can be exercised in a plain browser via `npm run
 * start:mock`.
 *
 * Generation itself has nothing to reproduce: `InMemoryEntriesApi` seeds its
 * own register rather than growing one occurrence at a time, so "nothing was
 * due" is the honest answer here and the account screen shows no toast — a
 * rule created through the modal changes the list, not the register.
 */
export class InMemoryRecurringRulesApi implements RecurringRulesApi {
  private rules = [...SEEDED];
  private nextId = Math.max(0, ...SEEDED.map((rule) => rule.id)) + 1;

  openAccount(): Promise<number> {
    return Promise.resolve(0);
  }

  generateAllDue(): Promise<void> {
    return Promise.resolve();
  }

  listRecurringRules(accountId: number): Promise<RecurringRule[]> {
    return Promise.resolve(this.rules.filter((rule) => rule.account_id === accountId));
  }

  createRecurringRule(accountId: number, input: RecurringRuleInput): Promise<RecurringRule> {
    const created: RecurringRule = { ...input, id: this.nextId++, account_id: accountId };
    this.rules = [...this.rules, created];
    return Promise.resolve(created);
  }

  /**
   * Takes no `scope`: overrides live in the entries the real backend
   * generates, and this fake generates none, so the argument the caller
   * passes has nothing to act on here.
   */
  updateRecurringRule(id: number, input: RecurringRuleInput): Promise<RecurringRule> {
    const existing = this.rules.find((rule) => rule.id === id);
    if (existing === undefined) {
      return Promise.reject({ kind: 'NotFound' });
    }

    const updated: RecurringRule = { ...input, id, account_id: existing.account_id };
    this.rules = this.rules.map((rule) => (rule.id === id ? updated : rule));
    return Promise.resolve(updated);
  }

  deleteRecurringRule(id: number): Promise<void> {
    this.rules = this.rules.filter((rule) => rule.id !== id);
    return Promise.resolve();
  }
}
