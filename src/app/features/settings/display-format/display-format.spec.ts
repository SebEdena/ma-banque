import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { DisplaySettingsService } from '../../../core/display-settings/display-settings';
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

function clickButtonContaining(fixture: ComponentFixture<DisplayFormat>, text: string): void {
  const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
  const button = buttons.find((b) => b.textContent?.includes(text));
  if (!button) {
    throw new Error(`no button found containing "${text}"`);
  }
  button.click();
}

describe('DisplayFormat', () => {
  it('renders the three date-format presets with a live example', async () => {
    const fixture = await createDisplayFormat(
      { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER') },
      { mode: signal('system') },
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('JJ/MM/AAAA');
    expect(text).toContain('AAAA-MM-JJ');
    expect(text).toContain('MM/JJ/AAAA');
  });

  it('renders the three currency-format presets with a live example', async () => {
    const fixture = await createDisplayFormat(
      { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER') },
      { mode: signal('system') },
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('€');
    expect(text).toContain('EUR');
  });

  it('renders the Clair/Sombre/Système theme control', async () => {
    const fixture = await createDisplayFormat(
      { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER') },
      { mode: signal('system') },
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Clair');
    expect(text).toContain('Sombre');
    expect(text).toContain('Système');
  });

  it('selecting a date-format preset calls DisplaySettingsService.update with the new preset', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const fixture = await createDisplayFormat(
      { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER'), update },
      { mode: signal('system') },
    );

    clickButtonContaining(fixture, 'AAAA-MM-JJ');

    expect(update).toHaveBeenCalledWith({ date_format: 'YMD', currency_format: 'SYMBOL_AFTER' });
  });

  it('selecting a currency-format preset calls DisplaySettingsService.update with the new preset', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const fixture = await createDisplayFormat(
      { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER'), update },
      { mode: signal('system') },
    );

    clickButtonContaining(fixture, 'EUR');

    expect(update).toHaveBeenCalledWith({ date_format: 'DMY', currency_format: 'ISO_CODE' });
  });

  it('selecting a theme option calls Theme.setTheme', async () => {
    const setTheme = vi.fn();
    const fixture = await createDisplayFormat(
      { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER') },
      { mode: signal('system'), setTheme },
    );

    clickButtonContaining(fixture, 'Sombre');

    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});
