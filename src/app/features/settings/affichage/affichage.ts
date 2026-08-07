import { Component, inject } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import {
  CurrencyFormat,
  DateFormat,
  DisplaySettings,
} from '../../../core/display-settings/display-settings.types';
import { DisplaySettingsService } from '../../../core/display-settings/display-settings';
import { formatAmount, formatDate } from '../../../core/display-settings/format';
import { Theme, ThemeMode } from '../../../core/theme/theme';

interface Option<T> {
  value: T;
  label: string;
}

/**
 * The Settings screen's "Affichage" tab (`docs/spec/05-settings-remainder.md`):
 * date/currency-format presets and the light/dark/system theme control.
 */
@Component({
  selector: 'app-affichage',
  imports: [...HlmButtonImports],
  templateUrl: './affichage.html',
})
export class Affichage {
  protected readonly displaySettings = inject(DisplaySettingsService);
  protected readonly theme = inject(Theme);

  private readonly today = new Date();
  private readonly sampleAmount = 1234.56;

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

  protected exampleDate(format: DateFormat): string {
    return formatDate(this.today, format);
  }

  protected exampleAmount(format: CurrencyFormat): string {
    return formatAmount(this.sampleAmount, format);
  }

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
