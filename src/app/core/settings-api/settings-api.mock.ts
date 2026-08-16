import type { DisplaySettings } from '@core/display-settings/display-settings.types';
import { SettingsApi } from './settings-api';

/**
 * In-memory stand-in for `SettingsApi`, activated by `--configuration mock`
 * (see `src/app/app.config.ts`) alongside `InMemoryAccountsApi`. Resolves a
 * fixed fake data folder so `App`'s gate (`src/app/app.ts`) skips the
 * first-launch prompt straight to the routed shell.
 */
export class InMemorySettingsApi implements SettingsApi {
  private dataFolder = '/mock/data-folder';

  private displaySettings: DisplaySettings = {
    date_format: 'DMY',
    currency_format: 'SYMBOL_AFTER',
  };

  getCurrentDataFolder(): Promise<string | null> {
    return Promise.resolve(this.dataFolder);
  }

  pickFolder(): Promise<string | null> {
    return Promise.resolve('/mock/picked-folder');
  }

  setDefaultDataFolder(): Promise<string> {
    this.dataFolder = '/mock/data-folder';
    return Promise.resolve(this.dataFolder);
  }

  openDataFolder(path: string): Promise<string> {
    this.dataFolder = path;
    return Promise.resolve(this.dataFolder);
  }

  moveDataFolder(destination: string): Promise<string> {
    this.dataFolder = destination;
    return Promise.resolve(this.dataFolder);
  }

  getDisplaySettings(): Promise<DisplaySettings> {
    return Promise.resolve(this.displaySettings);
  }

  updateDisplaySettings(settings: DisplaySettings): Promise<void> {
    this.displaySettings = settings;
    return Promise.resolve();
  }
}
