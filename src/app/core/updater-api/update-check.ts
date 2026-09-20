import { Service, inject } from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';

import { UpdaterApi } from './updater-api';

/**
 * Runs once at app startup (wired via `provideAppInitializer` in
 * `app.config.ts`, not from `App` itself, so unit tests that build `App`
 * directly through `TestBed` — see `app.spec.ts` — never trigger a real
 * network check). A failed check never blocks or throws past `run()` — a
 * background update check must never interrupt someone opening their
 * accounts — but it is now reported (toast + `console.error`, forwarded to
 * the Rust log file via `attachConsole()` in `app.config.ts`) rather than
 * failing silently, since a silent failure previously left no trace of why
 * the update toast never appeared.
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
      toast.error('La vérification de mise à jour a échoué');
      return;
    }

    if (!update) {
      return;
    }

    toast.info(`Une mise à jour est disponible (v${update.version})`, {
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
      toast.error("L'installation de la mise à jour a échoué");
    }
  }
}
