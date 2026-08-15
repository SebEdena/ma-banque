import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBrnCalendarI18n } from '@spartan-ng/brain/calendar';
import { provideNativeDateAdapter } from '@spartan-ng/brain/date-time';

import { mockBackend } from '../environments/environment';
import { routes } from './app.routes';
import { AccountsApi } from './core/accounts-api/accounts-api';
import { CategoriesApi } from './core/categories-api/categories-api';
import { FRENCH_CALENDAR_I18N } from './core/display-settings/calendar-i18n';
import { EntriesApi } from './core/entries-api/entries-api';
import { InMemoryAccountsApi } from './core/mocks/accounts-api.mock';
import { InMemoryCategoriesApi } from './core/mocks/categories-api.mock';
import { InMemoryEntriesApi } from './core/mocks/entries-api.mock';
import { InMemorySettingsApi } from './core/mocks/settings-api.mock';
import { SettingsApi } from './core/settings-api/settings-api';

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
      { provide: SettingsApi, useClass: InMemorySettingsApi },
    ]
  : [];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideNativeDateAdapter(),
    provideBrnCalendarI18n(FRENCH_CALENDAR_I18N),
    ...mockProviders,
  ],
};
