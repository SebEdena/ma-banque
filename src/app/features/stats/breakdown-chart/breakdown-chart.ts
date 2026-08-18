import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { VisDonutModule, VisSingleContainerModule } from '@unovis/angular';

import { CurrencyFormatPipe } from '@core/display-settings/currency-format.pipe';
import type { CurrencyFormat } from '@core/display-settings/display-settings.types';
import { CategoryBreakdownBucket } from '@data/statistics/statistics-api';

/**
 * The "Répartition des dépenses par poste" card (`docs/spec/09-statistics.md`,
 * user stories 8–13): a Unovis `Donut` of the period's expense buckets, its
 * hand-built legend, and the "Aucune dépense sur cette période." empty state.
 *
 * Presentational: `Stats` owns fetching the aggregate and knowing when a
 * `loaded`-but-empty result is genuinely empty rather than not-yet-requested.
 */
@Component({
  selector: 'app-breakdown-chart',
  imports: [CurrencyFormatPipe, VisDonutModule, VisSingleContainerModule],
  templateUrl: './breakdown-chart.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreakdownChart {
  readonly buckets = input.required<CategoryBreakdownBucket[]>();
  readonly totalExpenses = input.required<number>();
  /** Whether the aggregate has come back at least once — see `showEmpty`. */
  readonly loaded = input.required<boolean>();
  readonly currencyFormat = input.required<CurrencyFormat>();

  protected readonly centralSubLabel = 'Total dépenses';

  protected readonly hasBreakdown = computed(() => this.buckets().length > 0);
  /** Only shown once a request has actually come back empty, never on first render. */
  protected readonly showEmpty = computed(() => this.loaded() && !this.hasBreakdown());

  protected readonly donutColor = (bucket: CategoryBreakdownBucket): string => bucket.color;
  protected readonly donutValue = (bucket: CategoryBreakdownBucket): number => bucket.amount;
}
