import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideBrnCalendarI18n } from '@spartan-ng/brain/calendar';
import { provideNativeDateAdapter } from '@spartan-ng/brain/date-time';

import { mockBackend } from '../environments/environment';
import { routes } from './app.routes';
import { FRENCH_CALENDAR_I18N } from './core/display-settings/calendar-i18n';
import { InMemorySettingsApi } from './core/settings-api/settings-api.mock';
import { SettingsApi } from './core/settings-api/settings-api';
import { AccountsApi } from './data/accounts/accounts-api';
import { InMemoryAccountsApi } from './data/accounts/accounts-api.mock';
import { CategoriesApi } from './data/categories/categories-api';
import { InMemoryCategoriesApi } from './data/categories/categories-api.mock';
import { EntriesApi } from './data/entries/entries-api';
import { InMemoryEntriesApi } from './data/entries/entries-api.mock';
import { ReconciliationApi } from './data/reconciliation/reconciliation-api';
import { InMemoryReconciliationApi } from './data/reconciliation/reconciliation-api.mock';
import { RecurringRulesApi } from './data/recurring-rules/recurring-rules-api';
import { InMemoryRecurringRulesApi } from './data/recurring-rules/recurring-rules-api.mock';

/**
 * Only non-empty when built with `--configuration mock` (`npm run
 * start:mock`, see `angular.json`) — the default `environment.ts` hardcodes
 * `mockBackend` to the literal `false`, so the production build's esbuild
 * dead-code elimination drops this branch and its imports entirely.
 */
const mockProviders = mockBackend
  ? [
      { provide: AccountsApi, useClass: InMemoryAccountsApi },
      { provide: CategoriesApi, useClass: InMemoryCategoriesApi },
      { provide: EntriesApi, useClass: InMemoryEntriesApi },
      { provide: ReconciliationApi, useClass: InMemoryReconciliationApi },
      { provide: RecurringRulesApi, useClass: InMemoryRecurringRulesApi },
      { provide: SettingsApi, useClass: InMemorySettingsApi },
    ]
  : [];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideNativeDateAdapter(),
    provideBrnCalendarI18n(FRENCH_CALENDAR_I18N),
    ...mockProviders,
  ],
};
