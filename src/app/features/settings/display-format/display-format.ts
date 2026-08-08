import { Component, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMonitor, lucideMoon, lucideSun } from '@ng-icons/lucide';

import { CurrencyFormatPipe } from '../../../core/display-settings/currency-format.pipe';
import { DateFormatPipe } from '../../../core/display-settings/date-format.pipe';
import { DisplaySettingsService } from '../../../core/display-settings/display-settings';
import {
  CurrencyFormat,
  DateFormat,
  DisplaySettings,
} from '../../../core/display-settings/display-settings.types';
import { formatAmount, formatDate } from '../../../core/display-settings/format';
import { Theme, ThemeMode } from '../../../core/theme/theme';
import { OptionToggleGroup, ToggleOption } from './option-toggle-group/option-toggle-group';

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
  imports: [OptionToggleGroup, DateFormatPipe, CurrencyFormatPipe, NgIcon],
  providers: [provideIcons({ lucideSun, lucideMoon, lucideMonitor })],
  templateUrl: './display-format.html',
})
export class DisplayFormat {
  protected readonly displaySettings = inject(DisplaySettingsService);
  protected readonly theme = inject(Theme);

  protected readonly exampleDate = new Date();
  protected readonly exampleAmount = 1234.56;

  protected readonly dateFormatOptions: ToggleOption<DateFormat>[] = (
    [
      { value: 'DMY', label: 'JJ/MM/AAAA' },
      { value: 'YMD', label: 'AAAA-MM-JJ' },
      { value: 'MDY', label: 'MM/JJ/AAAA' },
    ] as const
  ).map((option) => ({
    value: option.value,
    label: formatDate(this.exampleDate, option.value),
    tooltip: option.label,
  }));

  protected readonly currencyFormatOptions: ToggleOption<CurrencyFormat>[] = (
    [
      { value: 'SYMBOL_AFTER', label: 'Montant puis symbole' },
      { value: 'SYMBOL_BEFORE', label: 'Symbole puis montant' },
      { value: 'ISO_CODE', label: 'Code ISO' },
    ] as const
  ).map((option) => ({
    value: option.value,
    label: formatAmount(this.exampleAmount, option.value),
    tooltip: option.label,
  }));

  protected readonly themeOptions: (Option<ThemeMode> & { icon: string })[] = [
    { value: 'light', label: 'Clair', icon: 'lucideSun' },
    { value: 'dark', label: 'Sombre', icon: 'lucideMoon' },
    { value: 'system', label: 'Système', icon: 'lucideMonitor' },
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
