import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import '@core/testing/jsdom-polyfills';
import { Settings } from './settings';

function one(fixture: ComponentFixture<Settings>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

/**
 * `hlm-select`'s dropdown portals its items to `document.body` while open —
 * see the identical helper in `entry-form.spec.ts`. Opens the trigger,
 * clicks the item, and lets the (default) auto-close on select settle.
 */
function selectSection(fixture: ComponentFixture<Settings>, itemTestId: string): void {
  one(fixture, 'settings-section-select')?.querySelector('button')?.click();
  fixture.detectChanges();
  (document.querySelector(`[data-testid="${itemTestId}"]`) as HTMLElement).click();
  fixture.detectChanges();
}

describe('Settings', () => {
  let fixture: ComponentFixture<Settings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('offers the three sections as a single select control, not a sidebar nav list', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('nav')).toBeNull();
    expect(one(fixture, 'settings-section-select')).not.toBeNull();

    one(fixture, 'settings-section-select')?.querySelector('button')?.click();
    fixture.detectChanges();
    const labels = Array.from(
      document.querySelectorAll('[data-testid^="settings-section-option-"]'),
    ).map((el) => el.textContent?.trim());

    expect(labels).toEqual(['Postes', 'Affichage', 'Stockage']);
  });

  it('navigates to the chosen section route when a section is selected', () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    selectSection(fixture, 'settings-section-option-storage');

    expect(navigate).toHaveBeenCalledWith(['/settings', 'storage']);
  });

  it('still renders the routed section content', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).not.toBeNull();
  });
});
