import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArchive, lucidePlus, lucideRotateCcw, lucideTrash2 } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';

import { Account, AccountInput, parseAccountError } from '@data/accounts/accounts-api';
import { AccountsStore } from '@data/accounts/accounts-store';
import { CurrencyFormatPipe } from '@core/display-settings/currency-format.pipe';
import { DateFormatPipe } from '@core/display-settings/date-format.pipe';
import { DisplaySettingsService } from '@core/display-settings/display-settings';
import { AccountSettingsModal } from './account-settings-modal/account-settings-modal';
import { ConfirmDialog } from '@shared/confirm-dialog/confirm-dialog';
import { parseIsoDate } from '@shared/iso-date/iso-date';
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
  imports: [
    RouterLink,
    NgIcon,
    DateFormatPipe,
    CurrencyFormatPipe,
    AccountSettingsModal,
    ConfirmDialog,
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
  providers: [
    provideCatalogIcons(),
    provideIcons({ lucideArchive, lucidePlus, lucideRotateCcw, lucideTrash2 }),
  ],
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
  protected readonly savingAccount = signal(false);

  /**
   * Saves what the modal found valid. `AccountSettingsModal` only validates
   * and builds the input (presentational); this container owns the backend
   * call and keeps the modal open on rejection.
   */
  protected async onAccountSubmitted(input: AccountInput): Promise<void> {
    this.savingAccount.set(true);
    try {
      await this.accounts.create(input);
      this.creating.set(false);
    } catch (error) {
      toast.error(parseAccountError(error));
    } finally {
      this.savingAccount.set(false);
    }
  }

  protected toggleArchived(): void {
    this.showingArchived.update((showing) => !showing);
  }

  /** The archived account awaiting delete confirmation, if any. */
  protected readonly deleting = signal<Account | null>(null);

  protected async archive(id: number): Promise<void> {
    await this.run(() => this.accounts.archive(id));
  }

  protected async unarchive(id: number): Promise<void> {
    await this.run(() => this.accounts.unarchive(id));
  }

  protected async confirmDelete(): Promise<void> {
    const account = this.deleting();
    if (account === null) {
      return;
    }

    this.deleting.set(null);
    // Rust refuses to delete an account with entries beyond its opening
    // balance, so a rejection here is the guard doing its job (a race, in
    // practice) rather than something to pre-empt in the UI.
    await this.run(() => this.accounts.delete(account.id));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      toast.error(parseAccountError(error));
    }
  }
}
