import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';

import { SettingsApi } from './core/settings-api/settings-api';
import { Theme } from './core/theme/theme';
import { FolderPrompt } from './features/onboarding/folder-prompt/folder-prompt';
import { Sidebar } from './layout/sidebar/sidebar';

type DataFolderState = 'loading' | 'ready' | 'blocked';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FolderPrompt, Sidebar, ...HlmToasterImports],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly theme = inject(Theme);
  private readonly settingsApi = inject(SettingsApi);

  /**
   * Gates the routed shell behind a resolved data folder (business
   * requirements §2.3.1) — first launch (`null`) and an unreachable
   * configured folder (rejection) both render the same blocking prompt
   * instead of any route.
   */
  protected readonly dataFolderState = signal<DataFolderState>('loading');

  constructor() {
    this.settingsApi
      .getCurrentDataFolder()
      .then((folder) => this.dataFolderState.set(folder === null ? 'blocked' : 'ready'))
      .catch(() => this.dataFolderState.set('blocked'));
  }

  protected onFolderResolved(): void {
    this.dataFolderState.set('ready');
  }
}
