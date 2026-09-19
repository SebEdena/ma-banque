import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import '@core/testing/jsdom-polyfills';
import { DisplaySettingsService } from '../../../core/display-settings/display-settings';
import { formatDate } from '../../../core/display-settings/format';
import { Theme } from '../../../core/theme/theme';
import { DisplayFormat } from './display-format';

async function createDisplayFormat(
  displaySettings: Partial<DisplaySettingsService>,
  theme: Partial<Theme>,
): Promise<ComponentFixture<DisplayFormat>> {
  await TestBed.configureTestingModule({
    imports: [DisplayFormat],
    providers: [
      { provide: DisplaySettingsService, useValue: displaySettings },
      { provide: Theme, useValue: theme },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(DisplayFormat);
  fixture.detectChanges();
  return fixture;
}

function one(fixture: ComponentFixture<DisplayFormat>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

/**
 * `hlm-select`'s dropdown is a `hlm-select-item` list portaled to
 * `document.body` — reachable by `data-testid`, but only while open — rather
 * than a native `<select>`'s options. Opens the trigger so its items render.
 */
function openSelect(fixture: ComponentFixture<DisplayFormat>, triggerTestId: string): void {
  one(fixture, triggerTestId)?.querySelector('button')?.click();
  fixture.detectChanges();
}

function selectOption(
  fixture: ComponentFixture<DisplayFormat>,
  triggerTestId: string,
  optionTestId: string,
): void {
  openSelect(fixture, triggerTestId);
  (document.querySelector(`[data-testid="${optionTestId}"]`) as HTMLElement).click();
  fixture.detectChanges();
}

describe('DisplayFormat', () => {
  it('renders the three date-format presets as select options with a live example', async () => {
    const fixture = await createDisplayFormat(
      { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER') },
      { mode: signal('system') },
    );
    const today = new Date();

    openSelect(fixture, 'display-format-date');
    const text = document.body.textContent ?? '';

    expect(text).toContain(formatDate(today, 'DMY'));
    expect(text).toContain(formatDate(today, 'YMD'));
    expect(text).toContain(formatDate(today, 'MDY'));
  });

  it('renders the three currency-format presets as select options with a live example', async () => {
    const fixture = await createDisplayFormat(
      { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER') },
      { mode: signal('system') },
    );

    openSelect(fixture, 'display-format-currency');
    const text = document.body.textContent ?? '';

    expect(text).toContain('€');
    expect(text).toContain('EUR');
  });

  it('renders the Clair/Sombre/Système theme options', async () => {
    const fixture = await createDisplayFormat(
      { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER') },
      { mode: signal('system') },
    );

    openSelect(fixture, 'display-format-theme');
    const text = document.body.textContent ?? '';

    expect(text).toContain('Clair');
    expect(text).toContain('Sombre');
    expect(text).toContain('Système');
  });

  it('shows the current preset/theme as each select trigger’s value', async () => {
    const fixture = await createDisplayFormat(
      { dateFormat: signal('YMD'), currencyFormat: signal('ISO_CODE') },
      { mode: signal('dark') },
    );
    const today = new Date();

    expect(one(fixture, 'display-format-date')?.textContent).toContain(formatDate(today, 'YMD'));
    expect(one(fixture, 'display-format-currency')?.textContent).toContain('EUR');
    expect(one(fixture, 'display-format-theme')?.textContent).toContain('Sombre');
  });

  it('selecting a date-format preset calls DisplaySettingsService.update with the new preset', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const fixture = await createDisplayFormat(
      { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER'), update },
      { mode: signal('system') },
    );

    selectOption(fixture, 'display-format-date', 'display-format-date-option-YMD');

    expect(update).toHaveBeenCalledWith({ date_format: 'YMD', currency_format: 'SYMBOL_AFTER' });
  });

  it('selecting a currency-format preset calls DisplaySettingsService.update with the new preset', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const fixture = await createDisplayFormat(
      { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER'), update },
      { mode: signal('system') },
    );

    selectOption(fixture, 'display-format-currency', 'display-format-currency-option-ISO_CODE');

    expect(update).toHaveBeenCalledWith({ date_format: 'DMY', currency_format: 'ISO_CODE' });
  });

  it('selecting a theme option calls Theme.setTheme', async () => {
    const setTheme = vi.fn();
    const fixture = await createDisplayFormat(
      { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER') },
      { mode: signal('system'), setTheme },
    );

    selectOption(fixture, 'display-format-theme', 'display-format-theme-option-dark');

    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});
