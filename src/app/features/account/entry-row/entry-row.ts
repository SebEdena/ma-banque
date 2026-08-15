import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideFlag, lucideLock, lucideTrash2 } from '@ng-icons/lucide';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { parseIsoDate } from '@core/accounts-api/accounts-api';
import { CurrencyFormatPipe } from '@core/display-settings/currency-format.pipe';
import { DateFormatPipe } from '@core/display-settings/date-format.pipe';
import type { CurrencyFormat, DateFormat } from '@core/display-settings/display-settings.types';
import { Entry } from '@core/entries-api/entries-api';
import { provideCatalogIcons } from '@shared/pickers/icon-catalog';
import { RowCategory } from '../row-category';

/**
 * One entry as the register displays it: reconciled checkbox, date,
 * category, label, amount and the delete affordance. Presentational — it
 * reads nothing and writes nothing, so the container stays the only place
 * that talks to `EntriesApi`.
 *
 * The host is `display: contents` because the row's flex layout, its fixed
 * height and its click target belong to the element `*cdkVirtualFor`
 * repeats, which stays in the container's template alongside the inline form
 * that replaces this component while the row is being edited.
 */
@Component({
  selector: 'app-entry-row',
  imports: [NgIcon, DateFormatPipe, CurrencyFormatPipe, ...HlmTooltipImports],
  templateUrl: './entry-row.html',
  styles: ':host { display: contents; }',
  styleUrl: '../accent.css',
  providers: [
    provideCatalogIcons(),
    provideIcons({ lucideCheck, lucideFlag, lucideLock, lucideTrash2 }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryRow {
  readonly entry = input.required<Entry>();
  readonly category = input.required<RowCategory>();
  readonly accountColor = input.required<string>();
  readonly dateFormat = input.required<DateFormat>();
  readonly currencyFormat = input.required<CurrencyFormat>();

  readonly reconciledToggled = output<void>();
  readonly deleteRequested = output<void>();

  protected readonly parseIsoDate = parseIsoDate;
}
