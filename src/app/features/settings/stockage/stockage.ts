import { Component, inject, signal } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { toast } from '@spartan-ng/brain/sonner';
import { open } from '@tauri-apps/plugin-dialog';

import { parseDataFolderLocationError, SettingsApi } from '../../../core/settings-api/settings-api';

/**
 * The Settings screen's "Stockage" tab (`docs/spec/05-settings-remainder.md`):
 * shows the current data folder and the two folder actions already built
 * and tested in `01-setup-backend.md` — "Move data folder" (relocates the
 * current folder) and "Open a different folder" (points at another one
 * without touching the current one).
 */
@Component({
  selector: 'app-stockage',
  imports: [...HlmButtonImports],
  templateUrl: './stockage.html',
})
export class Stockage {
  private readonly settingsApi = inject(SettingsApi);

  protected readonly currentFolder = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    this.settingsApi
      .getCurrentDataFolder()
      .then((folder) => this.currentFolder.set(folder))
      .catch((error: unknown) => {
        console.error('failed to get the current data folder', error);
        toast.error(parseDataFolderLocationError(error));
      });
  }

  protected moveDataFolder(): Promise<void> {
    return this.pickFolderAndRun((destination) => this.settingsApi.moveDataFolder(destination));
  }

  protected openDataFolder(): Promise<void> {
    return this.pickFolderAndRun((selected) => this.settingsApi.openDataFolder(selected));
  }

  /**
   * Opens the native folder picker, then runs `command` with the chosen
   * path — shared by both actions, which differ only in which `SettingsApi`
   * method they call.
   */
  private async pickFolderAndRun(command: (path: string) => Promise<string>): Promise<void> {
    this.busy.set(true);
    try {
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked !== 'string') {
        // User cancelled the picker — stay put.
        return;
      }
      this.currentFolder.set(await command(picked));
    } catch (error) {
      toast.error(parseDataFolderLocationError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
