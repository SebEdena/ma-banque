import { Service, inject, signal } from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';

import { parseSettingsError, SettingsApi } from '../settings-api/settings-api';
import type { CurrencyFormat, DateFormat, DisplaySettings } from './display-settings.types';
import { formatAmount } from './format';

/**
 * Signal-backed source of truth for the date/currency display presets
 * (see `docs/spec/05-settings-remainder.md`), read by the Affichage tab
 * and, later, by every money/date-displaying screen. Loads the persisted
 * settings once on construction and keeps its signals in sync with
 * whatever was last successfully persisted via `update`.
 */
@Service()
export class DisplaySettingsService {
  private readonly settingsApi = inject(SettingsApi);

  private readonly dateFormatSignal = signal<DateFormat>('DMY');
  private readonly currencyFormatSignal = signal<CurrencyFormat>('SYMBOL_AFTER');

  readonly dateFormat = this.dateFormatSignal.asReadonly();
  readonly currencyFormat = this.currencyFormatSignal.asReadonly();

  /**
   * Resolves once the initial load (constructor-triggered) has settled,
   * success or failure — exposed so callers (and tests) can wait
   * deterministically instead of guessing how many microtasks the internal
   * `.then()`/`.catch()` chain takes to flush.
   */
  readonly loaded: Promise<void>;

  constructor() {
    this.loaded = this.settingsApi
      .getDisplaySettings()
      .then((settings) => this.applyLocally(settings))
      .catch((error: unknown) => {
        console.error('failed to load display settings', error);
        toast.error(parseSettingsError(error));
      });
  }

  /** Persists `settings` via `SettingsApi`, then applies them locally. */
  async update(settings: DisplaySettings): Promise<void> {
    try {
      await this.settingsApi.updateDisplaySettings(settings);
      this.applyLocally(settings);
    } catch (error) {
      console.error('failed to update display settings', error);
      toast.error(parseSettingsError(error));
    }
  }

  /**
   * Formats an already-decimal `amount` per the current currency preset —
   * see `format.ts` for the "never divides by 100" contract.
   */
  formatAmount(amount: number): string {
    return formatAmount(amount, this.currencyFormatSignal());
  }

  private applyLocally(settings: DisplaySettings): void {
    this.dateFormatSignal.set(settings.date_format);
    this.currencyFormatSignal.set(settings.currency_format);
  }
}
