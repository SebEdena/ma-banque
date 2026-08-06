import { bootstrapApplication } from '@angular/platform-browser';
import { isDevMode } from '@angular/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// The wdio Tauri plugin does invoke interception for mocking — only load it
// in dev builds (never ship it in production). See wdio.conf.ts and
// src-tauri/src/lib.rs's matching debug-only tauri_plugin_wdio registration.
const pluginReady = isDevMode() ? import('@wdio/tauri-plugin') : Promise.resolve();

pluginReady.then(() => bootstrapApplication(App, appConfig)).catch((err) => console.error(err));
