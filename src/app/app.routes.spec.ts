import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

import { routes } from './app.routes';

describe('app routes', () => {
  beforeEach(() => {
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
