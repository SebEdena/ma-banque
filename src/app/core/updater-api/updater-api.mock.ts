import type { AvailableUpdate } from './updater-api';

/**
 * In-memory stand-in for `UpdaterApi`, activated by `--configuration mock`
 * (see `src/app/app.config.ts`). Always reports a fake update so `npm run
 * start:mock` lets you eyeball the update toast without a signed build.
 *
 * Not declared `implements UpdaterApi` (unlike the other `*.mock.ts` files)
 * because `UpdaterApi` holds a private `Update` handle between calls, which
 * makes it a nominal (not structural) type — a plain duck-typed stand-in
 * can't satisfy it, only a real subclass could.
 */
export class InMemoryUpdaterApi {
  checkForUpdate(): Promise<AvailableUpdate | null> {
    return Promise.resolve({ version: '99.0.0' });
  }

  downloadAndInstall(): Promise<void> {
    return Promise.resolve();
  }

  relaunch(): Promise<void> {
    return Promise.resolve();
  }
}
