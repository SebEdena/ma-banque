import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from './app.routes';

describe('app routes', () => {
  beforeEach(() => {
    // The home route lazy-loads Home, which calls the real @tauri-apps/api
    // invoke() — stub the global it reads from rather than mocking the
    // module itself, since module-level vi.mock doesn't reliably apply to
    // this lazily-loaded chunk. get_display_settings needs a real-shaped
    // response (unlike the other commands, `null` isn't a valid
    // DisplaySettings and makes DisplaySettingsService's constructor throw).
    vi.stubGlobal('__TAURI_INTERNALS__', {
      invoke: vi.fn((cmd: string) =>
        cmd === 'get_display_settings'
          ? Promise.resolve({ date_format: 'DMY', currency_format: 'SYMBOL_AFTER' })
          : Promise.resolve(null),
      ),
    });
    TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects the empty path to home', async () => {
    const harness = await RouterTestingHarness.create('/');
    expect(harness.routeNativeElement?.textContent).toContain('Accueil');
  });

  it('renders the account placeholder for a given account id', async () => {
    const harness = await RouterTestingHarness.create('/account/123');
    expect(harness.routeNativeElement?.textContent).toContain('Compte');
  });

  it('renders the stats placeholder for a given account id', async () => {
    const harness = await RouterTestingHarness.create('/stats/123');
    expect(harness.routeNativeElement?.textContent).toContain('Statistiques');
  });

  it('redirects settings to its categories child route', async () => {
    const harness = await RouterTestingHarness.create('/settings');
    expect(harness.routeNativeElement?.textContent).toContain('Catégories');
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
