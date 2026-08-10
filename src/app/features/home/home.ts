import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArchive, lucidePlus } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';

import { parseAccountError, parseIsoDate } from '@core/accounts-api/accounts-api';
import { AccountsStore } from '@core/accounts-api/accounts-store';
import { CurrencyFormatPipe } from '@core/display-settings/currency-format.pipe';
import { DateFormatPipe } from '@core/display-settings/date-format.pipe';
import { DisplaySettingsService } from '@core/display-settings/display-settings';
import { AccountSettingsModal } from '@shared/account-settings-modal/account-settings-modal';
import { provideCatalogIcons } from '@shared/pickers/icon-catalog';

/**
 * The home screen (business requirements §4.1): every active account as a
 * card, with archived accounts folded behind a count that toggles the list.
 *
 * Deliberately shows no reconciliation indicator — see the "No reconciliation
 * indicator on the home screen" decision in `docs/spec/03-accounts.md`, which
 * settles this against a literal reading of §4.1. Nothing later adds one.
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink, NgIcon, DateFormatPipe, CurrencyFormatPipe, AccountSettingsModal],
  templateUrl: './home.html',
  styleUrl: './home.css',
  providers: [provideCatalogIcons(), provideIcons({ lucideArchive, lucidePlus })],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly accounts = inject(AccountsStore);

  protected readonly displaySettings = inject(DisplaySettingsService);

  protected readonly showingArchived = signal(false);
  protected readonly activeAccounts = this.accounts.active;
  protected readonly archivedAccounts = this.accounts.archived;
  protected readonly shownAccounts = computed(() =>
    this.showingArchived() ? this.archivedAccounts() : this.activeAccounts(),
  );

  protected readonly parseIsoDate = parseIsoDate;

  /** Whether the create/edit modal is open. Creation is its only mode here. */
  protected readonly creating = signal(false);

  protected toggleArchived(): void {
    this.showingArchived.update((showing) => !showing);
  }

  protected async archive(id: number): Promise<void> {
    try {
      await this.accounts.archive(id);
    } catch (error) {
      toast.error(parseAccountError(error));
    }
  }
}
