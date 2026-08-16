import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideBrnCalendarI18n } from '@spartan-ng/brain/calendar';
import { provideNativeDateAdapter } from '@spartan-ng/brain/date-time';

import { AccountsStore } from '@data/accounts/accounts-store';
import { FRENCH_CALENDAR_I18N } from '@core/display-settings/calendar-i18n';
import { routes } from './app.routes';

describe('app routes', () => {
  beforeEach(() => {
    // The home route lazy-loads Home, which calls the real @tauri-apps/api
    // invoke() — stub the global it reads from rather than mocking the
    // module itself, since module-level vi.mock doesn't reliably apply to
    // this lazily-loaded chunk. get_display_settings needs a real-shaped
    // response (unlike the other commands, `null` isn't a valid
    // DisplaySettings and makes DisplaySettingsService's constructor throw);
    // the account-list commands likewise have to answer with arrays.
    vi.stubGlobal('__TAURI_INTERNALS__', {
      invoke: vi.fn((cmd: string) => {
        switch (cmd) {
          case 'get_display_settings':
            return Promise.resolve({ date_format: 'DMY', currency_format: 'SYMBOL_AFTER' });
          case 'list_active_accounts':
            return Promise.resolve([
              {
                id: 123,
                name: 'Compte Courant',
                color: '#3b82f6',
                icon: 'lucideWallet',
                created_date: '2026-01-15',
                opening_balance: 0,
                balance: 0,
                archived: false,
                last_entry_date: null,
              },
            ]);
          case 'list_archived_accounts':
          case 'list_categories':
            return Promise.resolve([]);
          case 'list_entries':
            return Promise.resolve({ entries: [], has_more: false });
          default:
            return Promise.resolve(null);
        }
      }),
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideNativeDateAdapter(),
        provideBrnCalendarI18n(FRENCH_CALENDAR_I18N),
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects the empty path to home', async () => {
    const harness = await RouterTestingHarness.create('/');
    expect(harness.routeNativeElement?.textContent).toContain('Comptes');
  });

  it('renders the entries screen for a given account id', async () => {
    const harness = await RouterTestingHarness.create('/account/123');
    await TestBed.inject(AccountsStore).loaded;
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('Compte Courant');
  });

  it('renders the stats placeholder for a given account id', async () => {
    const harness = await RouterTestingHarness.create('/stats/123');
    expect(harness.routeNativeElement?.textContent).toContain('Statistiques');
  });

  it('redirects settings to its Postes (categories) child route', async () => {
    const harness = await RouterTestingHarness.create('/settings');
    expect(harness.routeNativeElement?.textContent).toContain('Nouveau poste');
  });

  it('renders the Affichage (display-format) tab at /settings/display-format', async () => {
    const harness = await RouterTestingHarness.create('/settings/display-format');
    expect(harness.routeNativeElement?.textContent).toContain('Date · aperçu');
  });

  it('renders the Stockage (storage) tab at /settings/storage', async () => {
    const harness = await RouterTestingHarness.create('/settings/storage');
    expect(harness.routeNativeElement?.textContent).toContain('Emplacement du fichier de données');
  });
});
