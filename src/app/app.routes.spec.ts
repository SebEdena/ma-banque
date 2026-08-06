import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

import { routes } from './app.routes';

describe('app routes', () => {
  beforeEach(() => {
    // Vitest's Angular test runner shares the mocked module across spec
    // files within a worker, so the default set in the vi.mock factory
    // above can be clobbered by another file's afterEach (see home.spec.ts)
    // depending on run order — set it fresh before every test instead of
    // relying on the factory-level default.
    vi.mocked(invoke).mockResolvedValue(null);
    TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    });
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
});
