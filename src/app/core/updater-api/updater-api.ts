import { Service } from '@angular/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/** What `UpdateCheckService` needs to know about a pending update. */
export interface AvailableUpdate {
  version: string;
}

/**
 * Wraps `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` so
 * components never import from `@tauri-apps/*` directly — same seam as
 * `SettingsApi` (`src/app/core/settings-api/settings-api.ts`). Keeps the
 * real `Update` handle internal rather than handing it to callers, so the
 * mock (`updater-api.mock.ts`) only has to fake the plain `AvailableUpdate`
 * shape instead of the SDK's class.
 */
@Service()
export class UpdaterApi {
  private pendingUpdate: Update | null = null;

  /** Resolves `null` when already on the latest version. */
  async checkForUpdate(): Promise<AvailableUpdate | null> {
    const update = await check();
    this.pendingUpdate = update;
    return update ? { version: update.version } : null;
  }

  /** Downloads and installs the update found by the last `checkForUpdate()`. */
  async downloadAndInstall(): Promise<void> {
    if (!this.pendingUpdate) {
      return;
    }
    await this.pendingUpdate.downloadAndInstall();
  }

  async relaunch(): Promise<void> {
    await relaunch();
  }
}
