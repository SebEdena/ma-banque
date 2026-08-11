import { readdirSync } from 'node:fs';
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

// Every other `e2e/*.e2e.ts` file, discovered automatically so a new
// business-flow spec needs no wdio.conf.ts edit to join the shared session.
const otherSpecs = readdirSync('./e2e')
  .filter((file) => file.endsWith('.e2e.ts') && file !== 'smoke.e2e.ts')
  .sort()
  .map((file) => `./e2e/${file}`);

export const config: WebdriverIO.Config = {
  runner: 'local',
  // A nested array runs its files in one shared app session, in the order
  // listed, instead of relaunching the app per file — `smoke.e2e.ts` gets
  // the app past the first-launch folder prompt once, and every file after
  // it (via `support/routed-shell.ts`'s idempotent `ensureRoutedShell`)
  // picks up from the already-routed shell.
  specs: [['./e2e/smoke.e2e.ts', ...otherSpecs]],
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
