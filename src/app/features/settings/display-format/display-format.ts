import { Component, computed, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMonitor, lucideMoon, lucideSun } from '@ng-icons/lucide';
import { HlmSelectImports } from '@spartan-ng/helm/select';

import { CurrencyFormatPipe } from '@core/display-settings/currency-format.pipe';
import { DateFormatPipe } from '@core/display-settings/date-format.pipe';
import { DisplaySettingsService } from '@core/display-settings/display-settings';
import {
  CurrencyFormat,
  DateFormat,
  DisplaySettings,
} from '@core/display-settings/display-settings.types';
import { formatAmount, formatDate } from '@core/display-settings/format';
import { Theme, ThemeMode } from '@core/theme/theme';

interface Option<T> {
  value: T;
  label: string;
  /** The preset's own name (date pattern / currency layout), shown as
   *  secondary text next to the live-formatted `label` in the dropdown. */
  tooltip: string;
}

/**
 * The Settings screen's "Affichage" (display format) tab
 * (`docs/spec/05-settings-remainder.md`): date/currency-format presets and
 * the light/dark/system theme control, each picked from a `hlm-select`
 * dropdown per the reference screenshot on ma-banque#16 (a divided list of
 * rows, each with its own select), not the segmented-pill toggle this tab
 * shipped with initially.
 */
@Component({
  selector: 'app-display-format',
  imports: [...HlmSelectImports, DateFormatPipe, CurrencyFormatPipe, NgIcon],
  providers: [provideIcons({ lucideSun, lucideMoon, lucideMonitor })],
  templateUrl: './display-format.html',
})
export class DisplayFormat {
  protected readonly displaySettings = inject(DisplaySettingsService);
  protected readonly theme = inject(Theme);

  protected readonly exampleDate = new Date();
  protected readonly exampleAmount = 1234.56;

  protected readonly dateFormatOptions: Option<DateFormat>[] = (
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

  protected readonly currencyFormatOptions: Option<CurrencyFormat>[] = (
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
    { value: 'light', label: 'Clair', tooltip: 'Clair', icon: 'lucideSun' },
    { value: 'dark', label: 'Sombre', tooltip: 'Sombre', icon: 'lucideMoon' },
    { value: 'system', label: 'Système', tooltip: 'Système', icon: 'lucideMonitor' },
  ];

  /** The trigger label for each select — the raw value isn't human-readable. */
  protected readonly dateFormatItemToString = (value: DateFormat | undefined): string =>
    this.dateFormatOptions.find((option) => option.value === value)?.label ?? '';

  protected readonly currencyFormatItemToString = (value: CurrencyFormat | undefined): string =>
    this.currencyFormatOptions.find((option) => option.value === value)?.label ?? '';

  protected readonly themeItemToString = (value: ThemeMode | undefined): string =>
    this.themeOptions.find((option) => option.value === value)?.label ?? '';

  /** Icon shown next to the theme select's current value. */
  protected readonly selectedThemeIcon = computed(
    () => this.themeOptions.find((option) => option.value === this.theme.mode())?.icon ?? '',
  );

  protected selectDateFormat(format: DateFormat | null | undefined): void {
    if (format) {
      this.updateDisplaySettings({ date_format: format });
    }
  }

  protected selectCurrencyFormat(format: CurrencyFormat | null | undefined): void {
    if (format) {
      this.updateDisplaySettings({ currency_format: format });
    }
  }

  private updateDisplaySettings(change: Partial<DisplaySettings>): void {
    void this.displaySettings.update({
      date_format: this.displaySettings.dateFormat(),
      currency_format: this.displaySettings.currencyFormat(),
      ...change,
    });
  }

  protected selectTheme(mode: ThemeMode | null | undefined): void {
    if (mode) {
      this.theme.setTheme(mode);
    }
  }
}
