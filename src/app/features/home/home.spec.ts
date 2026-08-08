import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { DisplaySettingsService } from '../../core/display-settings/display-settings';
import { Home } from './home';

async function createHome(
  displaySettings: Partial<DisplaySettingsService> = {
    dateFormat: signal('DMY'),
    currencyFormat: signal('SYMBOL_AFTER'),
  },
): Promise<ComponentFixture<Home>> {
  await TestBed.configureTestingModule({
    imports: [Home],
    providers: [provideRouter([]), { provide: DisplaySettingsService, useValue: displaySettings }],
  }).compileComponents();

  const fixture = TestBed.createComponent(Home);
  fixture.detectChanges();
  return fixture;
}

function textOf(fixture: ComponentFixture<Home>, testId: string): string {
  const element = (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
  return element?.textContent?.trim() ?? '';
}

describe('Home', () => {
  it('should create', async () => {
    const fixture = await createHome();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders its placeholder content', async () => {
    const fixture = await createHome();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Accueil');
  });

  it('renders the sample date and amount using the current display settings', async () => {
    const fixture = await createHome();

    expect(textOf(fixture, 'demo-date')).toBe('05/03/2026');
    expect(textOf(fixture, 'demo-amount')).toMatch(/234,56\s€$/);
  });

  it('reformats the sample values when the display settings change', async () => {
    const fixture = await createHome({
      dateFormat: signal('YMD'),
      currencyFormat: signal('ISO_CODE'),
    });

    expect(textOf(fixture, 'demo-date')).toBe('2026-03-05');
    expect(textOf(fixture, 'demo-amount')).toMatch(/234,56\sEUR$/);
  });

  it('links to the settings screen', async () => {
    const fixture = await createHome();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a');

    expect(link?.getAttribute('href')).toBe('/settings/display-format');
  });
});
