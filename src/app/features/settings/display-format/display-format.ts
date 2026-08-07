import { Component, inject } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import { CurrencyFormatPipe } from '../../../core/display-settings/currency-format.pipe';
import { DateFormatPipe } from '../../../core/display-settings/date-format.pipe';
import { DisplaySettingsService } from '../../../core/display-settings/display-settings';
import {
  CurrencyFormat,
  DateFormat,
  DisplaySettings,
} from '../../../core/display-settings/display-settings.types';
import { Theme, ThemeMode } from '../../../core/theme/theme';

interface Option<T> {
  value: T;
  label: string;
}

/**
 * The Settings screen's "Affichage" (display format) tab
 * (`docs/spec/05-settings-remainder.md`): date/currency-format presets and
 * the light/dark/system theme control.
 */
@Component({
  selector: 'app-display-format',
  imports: [...HlmButtonImports, DateFormatPipe, CurrencyFormatPipe],
  templateUrl: './display-format.html',
})
export class DisplayFormat {
  protected readonly displaySettings = inject(DisplaySettingsService);
  protected readonly theme = inject(Theme);

  protected readonly exampleDate = new Date();
  protected readonly exampleAmount = 1234.56;

  protected readonly dateFormatOptions: Option<DateFormat>[] = [
    { value: 'DMY', label: 'JJ/MM/AAAA' },
    { value: 'YMD', label: 'AAAA-MM-JJ' },
    { value: 'MDY', label: 'MM/JJ/AAAA' },
  ];

  protected readonly currencyFormatOptions: Option<CurrencyFormat>[] = [
    { value: 'SYMBOL_AFTER', label: 'Montant puis symbole' },
    { value: 'SYMBOL_BEFORE', label: 'Symbole puis montant' },
    { value: 'ISO_CODE', label: 'Code ISO' },
  ];

  protected readonly themeOptions: Option<ThemeMode>[] = [
    { value: 'light', label: 'Clair' },
    { value: 'dark', label: 'Sombre' },
    { value: 'system', label: 'Système' },
  ];

  protected selectDateFormat(format: DateFormat): void {
    this.updateDisplaySettings({ date_format: format });
  }

  protected selectCurrencyFormat(format: CurrencyFormat): void {
    this.updateDisplaySettings({ currency_format: format });
  }

  private updateDisplaySettings(change: Partial<DisplaySettings>): void {
    void this.displaySettings.update({
      date_format: this.displaySettings.dateFormat(),
      currency_format: this.displaySettings.currencyFormat(),
      ...change,
    });
  }

  protected selectTheme(mode: ThemeMode): void {
    this.theme.setTheme(mode);
  }
}
