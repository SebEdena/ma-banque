import { RecurringRulesApi } from './recurring-rules-api';

/**
 * In-memory stand-in for `RecurringRulesApi`, activated by `--configuration
 * mock` (see `src/app/app.config.ts`) so the screens that trigger generation
 * can be exercised in a plain browser via `npm run start:mock`.
 *
 * Generation itself has nothing to reproduce: `InMemoryEntriesApi` seeds its
 * own register rather than growing one occurrence at a time, so "nothing was
 * due" is the honest answer here and the account screen shows no toast.
 */
export class InMemoryRecurringRulesApi implements RecurringRulesApi {
  openAccount(): Promise<number> {
    return Promise.resolve(0);
  }

  generateAllDue(): Promise<void> {
    return Promise.resolve();
  }
}
