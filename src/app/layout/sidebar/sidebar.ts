import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHouse, lucideSettings } from '@ng-icons/lucide';

import { AccountsStore } from '@data/accounts/accounts-store';
import { provideCatalogIcons } from '@shared/pickers/icon-catalog';

/**
 * The persistent navigation shell's left rail: home, one entry per active
 * account, settings.
 *
 * The account rail reads `AccountsStore`'s signals — the same ones the home
 * screen's cards render — rather than fetching its own list, so the two
 * navigation surfaces can't drift apart (`docs/spec/03-accounts.md`, user
 * story 20).
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, NgIcon],
  templateUrl: './sidebar.html',
  providers: [provideCatalogIcons(), provideIcons({ lucideHouse, lucideSettings })],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  private readonly accounts = inject(AccountsStore);

  protected readonly activeAccounts = this.accounts.active;
}
