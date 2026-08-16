import { Component, inject, output, signal } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { toast } from '@spartan-ng/brain/sonner';

import { parseDataFolderLocationError, SettingsApi } from '@core/settings-api/settings-api';

/**
 * Blocking first-launch / unreachable-folder prompt (business requirements
 * §2.3.1). Rendered by `App` in place of the routed shell whenever
 * `get_current_data_folder` resolves to `null` or rejects — not a route,
 * since there's nothing sensible to route to until it resolves.
 */
@Component({
  selector: 'app-folder-prompt',
  imports: [...HlmButtonImports],
  templateUrl: './folder-prompt.html',
})
export class FolderPrompt {
  private readonly settingsApi = inject(SettingsApi);

  protected readonly busy = signal(false);

  /** Emitted once a data folder has been successfully configured. */
  readonly resolved = output<void>();

  protected async useDefaultLocation(): Promise<void> {
    this.busy.set(true);
    try {
      await this.settingsApi.setDefaultDataFolder();
      this.resolved.emit();
    } catch (error) {
      toast.error(parseDataFolderLocationError(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async chooseFolder(): Promise<void> {
    this.busy.set(true);
    try {
      const selected = await this.settingsApi.pickFolder();
      if (selected === null) {
        // User cancelled the picker — stay on the prompt.
        return;
      }
      await this.settingsApi.openDataFolder(selected);
      this.resolved.emit();
    } catch (error) {
      toast.error(parseDataFolderLocationError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
