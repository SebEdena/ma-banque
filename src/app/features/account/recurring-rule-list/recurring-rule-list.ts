import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePencil, lucideTrash2 } from '@ng-icons/lucide';

import type { CurrencyFormat, DateFormat } from '@core/display-settings/display-settings.types';
import { formatDate } from '@core/display-settings/format';
import { CurrencyFormatPipe } from '@core/display-settings/currency-format.pipe';
import { Category } from '@data/categories/categories-api';
import { Frequency, RecurringRule } from '@data/recurring-rules/recurring-rules-api';
import { parseIsoDate } from '@shared/iso-date/iso-date';
import { provideCatalogIcons } from '@shared/pickers/icon-catalog';
import { RowCategory, UNCATEGORIZED } from '../row-category';

/**
 * The plain-language schedule a row shows. Singular and plural are separate
 * strings rather than an interval spliced into one template, because French
 * changes the article as well as the noun ("Tous les mois" / "Toutes les 3
 * semaines").
 */
function scheduleSummary(frequency: Frequency, interval: number): string {
  switch (frequency) {
    case 'WEEKLY':
      return interval === 1 ? 'Toutes les semaines' : `Toutes les ${interval} semaines`;
    case 'YEARLY':
      return interval === 1 ? 'Tous les ans' : `Tous les ${interval} ans`;
    default:
      return interval === 1 ? 'Tous les mois' : `Tous les ${interval} mois`;
  }
}

/**
 * The account's recurring rules as a list, or the empty state when it has
 * none — `RecurringRulesModal`'s list-mode view (business requirements
 * §4.3's last bullet).
 *
 * Presentational: it renders the rules it is given and reports which one an
 * edit or delete click landed on. Loading, creating, saving and deleting
 * themselves stay the container's job, same split as `EntryRow`/`Account`
 * for the register.
 */
@Component({
  selector: 'app-recurring-rule-list',
  imports: [NgIcon, CurrencyFormatPipe],
  templateUrl: './recurring-rule-list.html',
  styleUrl: '../accent.css',
  providers: [provideCatalogIcons(), provideIcons({ lucidePencil, lucideTrash2 })],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringRuleList {
  readonly rules = input.required<RecurringRule[]>();
  readonly categories = input.required<Category[]>();
  readonly currencyFormat = input.required<CurrencyFormat>();
  readonly dateFormat = input.required<DateFormat>();

  readonly edit = output<RecurringRule>();
  readonly delete = output<RecurringRule>();

  protected readonly scheduleSummary = scheduleSummary;

  private readonly categoriesById = computed(
    () => new Map(this.categories().map((category) => [category.id, category])),
  );

  protected swatchOf(categoryId: number | null): RowCategory {
    return (
      (categoryId === null ? undefined : this.categoriesById().get(categoryId)) ?? UNCATEGORIZED
    );
  }

  /** The date range a row spells out beside its frequency. */
  protected dateRange(rule: RecurringRule): string {
    const format = this.dateFormat();
    const start = formatDate(parseIsoDate(rule.start_date), format);
    return rule.end_date === null
      ? `depuis le ${start}`
      : `du ${start} au ${formatDate(parseIsoDate(rule.end_date), format)}`;
  }
}
