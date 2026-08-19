import { Service, inject } from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';

import { UpdaterApi } from './updater-api';

/**
 * Runs once at app startup (wired via `provideAppInitializer` in
 * `app.config.ts`, not from `App` itself, so unit tests that build `App`
 * directly through `TestBed` — see `app.spec.ts` — never trigger a real
 * network check). A failed check is silent (logged only): a background
 * update check must never interrupt someone opening their accounts.
 */
@Service()
export class UpdateCheckService {
  private readonly updaterApi = inject(UpdaterApi);

  async run(): Promise<void> {
    let update;
    try {
      update = await this.updaterApi.checkForUpdate();
    } catch (error) {
      console.error('failed to check for updates', error);
      return;
    }

    if (!update) {
      return;
    }

    toast(`Une mise à jour est disponible (v${update.version})`, {
      action: {
        label: 'Installer et redémarrer',
        onClick: () => void this.installAndRelaunch(),
      },
      duration: Infinity,
    });
  }

  private async installAndRelaunch(): Promise<void> {
    try {
      await this.updaterApi.downloadAndInstall();
      await this.updaterApi.relaunch();
    } catch (error) {
      console.error('failed to install the update', error);
      toast.error("l'installation de la mise à jour a échoué");
    }
  }
}
