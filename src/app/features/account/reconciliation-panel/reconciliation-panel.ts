import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideCircleCheck } from '@ng-icons/lucide';
import { HlmDatePickerImports } from '@spartan-ng/helm/date-picker';

import type { CurrencyFormat, DateFormat } from '@core/display-settings/display-settings.types';
import { formatAmount, formatDate, parseFormattedDate } from '@core/display-settings/format';
import { ReconciliationSummary } from '@data/reconciliation/reconciliation-api';
import { AmountInput, formatAmountInput, parseAmount } from '@shared/amount-input/amount-input';
import { parseIsoDate, toIsoDate } from '@shared/iso-date/iso-date';
import { ReconciliationFilter } from '../reconciliation-filter/reconciliation-filter';

const BANK_BALANCE_INVALID_MESSAGE = 'Montant invalide';

/**
 * The collapsible _Pointage_ strip above the entries filters (business
 * requirements §4.3): reconciled balance, the bank statement's own balance and
 * cut-off date, and the signed difference between the two with its red/green
 * verdict — plus the "Inclure lignes pointées" checkbox, ticked by default,
 * that narrows the register to the still-unreconciled entries once
 * unticked.
 *
 * Presentational: it renders the summary it is given and reports what the
 * user did. The panel-open/filter coupling and every backend call live in
 * `Account`, which already owns the query the filter feeds into.
 *
 * The verdict colours are the one thing on this screen that does **not** take
 * the account's accent: a semantic red/green that changed per account would
 * signal nothing.
 */
@Component({
  selector: 'app-reconciliation-panel',
  imports: [NgIcon, AmountInput, ReconciliationFilter, ...HlmDatePickerImports],
  templateUrl: './reconciliation-panel.html',
  styleUrl: '../accent.css',
  providers: [provideIcons({ lucideCircleAlert, lucideCircleCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReconciliationPanel {
  readonly summary = input.required<ReconciliationSummary>();
  readonly accountColor = input.required<string>();
  readonly currencyFormat = input.required<CurrencyFormat>();
  readonly dateFormat = input.required<DateFormat>();

  /**
   * The checkbox's own value — `Account` owns whether it currently bites.
   * `true` means reconciled entries stay in the list (the default); unticking
   * it is what narrows the list to the still-unreconciled ones.
   */
  readonly includeReconciled = input.required<boolean>();

  /** A bank balance the field read as a number, in major units as typed. */
  readonly bankBalanceChanged = output<number>();
  readonly statementDateChanged = output<string>();
  readonly includeReconciledToggled = output<void>();

  /**
   * The bank-balance field's raw text. Re-seeded whenever a new summary
   * arrives, so the figure the backend stored replaces whatever was typed,
   * while an in-progress edit survives its own keystrokes.
   */
  protected readonly bankBalanceText = linkedSignal(() => {
    const balance = this.summary().bank_balance;
    return balance === null ? '' : formatAmountInput(balance);
  });

  protected readonly bankBalanceError = signal<string | null>(null);

  /**
   * The two derived figures, already formatted, or `null` when the summary
   * doesn't have them — an absent figure is a prompt, never a zero. Formatted
   * here rather than through `currencyFormat` in the template so `null` stays
   * distinguishable from a genuine `0,00 €`.
   */
  protected readonly reconciledBalanceText = computed(() =>
    this.formatted(this.summary().reconciled_balance),
  );

  /** Signed, deliberately: its sign is what says which side is short. */
  protected readonly deltaText = computed(() => this.formatted(this.summary().delta));

  /** `undefined` rather than `null`, which is what the date picker takes for "unset". */
  protected readonly statementDate = computed(() => {
    const date = this.summary().statement_date;
    return date === null ? undefined : parseIsoDate(date);
  });

  protected readonly filterDisabled = computed(() => this.summary().unreconciled_count === 0);

  /**
   * Green at exactly zero, red at any other difference — one cent either way
   * is a discrepancy, not a rounding tolerance. `is_balanced` is the
   * backend's answer over integer cents rather than a second comparison over
   * the major units it divided out.
   */
  protected readonly balanced = computed(() => this.summary().is_balanced);

  protected readonly formatStatementDate = computed(() => {
    const format = this.dateFormat();
    return (date: Date): string => formatDate(date, format);
  });

  /** Typing/edit format matches the display format — no surprise reformat on focus. */
  protected readonly parseStatementDate = (value: string): Date | null =>
    parseFormattedDate(value, this.dateFormat());

  protected onBankBalanceInput(value: string): void {
    this.bankBalanceText.set(value);
  }

  /**
   * Commits what the field holds. Unreadable text stays put with an inline
   * error rather than emitting, so the typo can be fixed where it was made;
   * an emptied field emits nothing either, since clearing a bank balance is
   * not an offered action (`docs/spec/08-reconciliation.md`).
   */
  protected commitBankBalance(): void {
    const text = this.bankBalanceText().trim();
    if (text === '') {
      this.bankBalanceError.set(null);
      return;
    }

    const amount = parseAmount(text);
    if (amount === null) {
      this.bankBalanceError.set(BANK_BALANCE_INVALID_MESSAGE);
      return;
    }

    this.bankBalanceError.set(null);
    this.bankBalanceChanged.emit(amount);
  }

  protected onStatementDateChange(date: Date | null): void {
    if (date === null) {
      return;
    }
    this.statementDateChanged.emit(toIsoDate(date));
  }

  private formatted(amount: number | null): string | null {
    return amount === null ? null : formatAmount(amount, this.currencyFormat());
  }
}
