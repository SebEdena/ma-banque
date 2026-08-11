import { platform } from 'node:os';

import type { TauriCapabilities } from '@wdio/tauri-service';

const applicationPath =
  platform() === 'win32'
    ? './src-tauri/target/debug/ma-banque.exe'
    : './src-tauri/target/debug/ma-banque';

const tauriCapabilities: TauriCapabilities = {
  browserName: 'tauri',
  'tauri:options': {
    application: applicationPath,
  },
};

export const config: WebdriverIO.Config = {
  runner: 'local',
  // A nested array runs its files in one shared app session, in the order
  // listed, instead of relaunching the app per file — `smoke.e2e.ts` gets
  // the app past the first-launch folder prompt once, and every file after
  // it (via `support/routed-shell.ts`'s idempotent `ensureRoutedShell`)
  // picks up from the already-routed shell. Add new business-flow spec
  // files to this same group, after `smoke.e2e.ts`.
  specs: [['./e2e/smoke.e2e.ts', './e2e/accounts.e2e.ts']],
  maxInstances: 1,
  capabilities: [tauriCapabilities],
  services: [['tauri', { driverProvider: 'external' }]],
  logLevel: 'warn',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
};
