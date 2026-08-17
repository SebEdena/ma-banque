import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';

import { SettingsApi } from './core/settings-api/settings-api';
import { Theme } from './core/theme/theme';
import { RecurringRulesApi, parseRecurringError } from './data/recurring-rules/recurring-rules-api';
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
  private readonly recurringRulesApi = inject(RecurringRulesApi);

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
      .then((folder) => (folder === null ? this.dataFolderState.set('blocked') : this.openShell()))
      .catch(() => this.dataFolderState.set('blocked'));
  }

  protected onFolderResolved(): void {
    void this.openShell();
  }

  /**
   * Sweeps every account's due recurring occurrences before the routed shell
   * renders. The wait is deliberate: `AccountsStore` loads in its own
   * constructor, so a sweep that hadn't finished first would leave the home
   * screen's cards showing pre-generation balances.
   *
   * The sweep can't live in Tauri's `setup()` hook — on first launch, or when
   * the configured folder is unreachable, the backend runs on a placeholder
   * connection while this component blocks on the folder prompt, so there
   * would be nothing to generate against.
   */
  private async openShell(): Promise<void> {
    try {
      await this.recurringRulesApi.generateAllDue();
    } catch (error) {
      // A generation failure must not cost the user their app.
      toast.error(parseRecurringError(error));
    }
    this.dataFolderState.set('ready');
  }
}
