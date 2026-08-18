import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { VisDonutModule, VisSingleContainerModule } from '@unovis/angular';

import { CurrencyFormatPipe } from '@core/display-settings/currency-format.pipe';
import type { CurrencyFormat } from '@core/display-settings/display-settings.types';
import { CategoryBreakdownBucket } from '@data/statistics/statistics-api';

/**
 * A category-breakdown donut card (`docs/spec/09-statistics.md`, user
 * stories 8–13 for the expense donut, "Credit breakdown" under
 * Implementation Decisions for its credit twin): a Unovis `Donut` of the
 * period's buckets, its hand-built legend, and an empty-state message.
 *
 * Presentational and reused for both the expense and credit donuts — `title`,
 * `emptyMessage` and `centralSubLabel` are inputs rather than hard-coded so
 * one component instance serves both cards. `testIdPrefix` keeps the two
 * instances' `data-testid` hooks distinct so they can render side by side
 * without collision (the expense instance defaults to no prefix, keeping its
 * existing e2e/test hooks unchanged).
 *
 * `Stats` owns fetching the aggregate and knowing when a `loaded`-but-empty
 * result is genuinely empty rather than not-yet-requested.
 */
@Component({
  selector: 'app-breakdown-chart',
  imports: [CurrencyFormatPipe, VisDonutModule, VisSingleContainerModule],
  templateUrl: './breakdown-chart.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreakdownChart {
  readonly buckets = input.required<CategoryBreakdownBucket[]>();
  readonly total = input.required<number>();
  /** Whether the aggregate has come back at least once — see `showEmpty`. */
  readonly loaded = input.required<boolean>();
  readonly currencyFormat = input.required<CurrencyFormat>();
  readonly title = input.required<string>();
  readonly emptyMessage = input.required<string>();
  readonly centralSubLabel = input.required<string>();
  /** Prepended to every `data-testid` in this instance; defaults to none. */
  readonly testIdPrefix = input<string>('');

  protected readonly hasBreakdown = computed(() => this.buckets().length > 0);
  /** Only shown once a request has actually come back empty, never on first render. */
  protected readonly showEmpty = computed(() => this.loaded() && !this.hasBreakdown());

  protected readonly donutColor = (bucket: CategoryBreakdownBucket): string => bucket.color;
  protected readonly donutValue = (bucket: CategoryBreakdownBucket): number => bucket.amount;

  protected testId(id: string): string {
    return this.testIdPrefix() + id;
  }
}
