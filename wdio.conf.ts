import type { TauriCapabilities } from '@wdio/tauri-service';

const tauriCapabilities: TauriCapabilities = {
  browserName: 'tauri',
  'tauri:options': {
    application: './src-tauri/target/debug/ma-banque',
  },
};

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./e2e/**/*.e2e.ts'],
  maxInstances: 1,
  capabilities: [tauriCapabilities],
  services: [['tauri', { driverProvider: 'external' }]],
  logLevel: 'info',
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
