import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  VisAxisModule,
  VisGroupedBarModule,
  VisTooltipModule,
  VisXYContainerModule,
} from '@unovis/angular';
import { GroupedBar } from '@unovis/ts';

import type { CurrencyFormat, DateFormat } from '@core/display-settings/display-settings.types';
import { formatAmount } from '@core/display-settings/format';
import { MonthBucket } from '@data/statistics/statistics-api';

/**
 * `GroupedBar`'s two y-series in display order — index 0 is income, index 1
 * is expense. `color`/tooltip accessors below key off this same order, since
 * that is the order Unovis calls them in (one call per series, per bar
 * group) rather than the order dictated by the datum itself.
 */
const MONTH_SERIES: readonly {
  label: string;
  color: string;
  value: (bucket: MonthBucket) => number;
}[] = [
  { label: 'Recettes', color: 'var(--positive)', value: (bucket) => bucket.income },
  { label: 'Dépenses', color: 'var(--negative)', value: (bucket) => bucket.expense },
];

/** Renders a `YYYY-MM` month key as a short label, respecting date-format order. */
function monthLabel(month: string, format: DateFormat): string {
  const [year, monthNumber] = month.split('-');
  return format === 'YMD' ? `${year}-${monthNumber}` : `${monthNumber}/${year}`;
}

/**
 * The "Recettes / Dépenses par mois" card (`docs/spec/09-statistics.md`,
 * user stories 14–18): a Unovis `GroupedBar` inside an `XYContainer`
 * comparing income and expense per month, with a hand-built legend and
 * Unovis's built-in hover tooltip.
 *
 * Presentational: `Stats` owns fetching the month-bucketed aggregate
 * (already gap-filled by the use case) and the display-format settings that
 * drive `dateFormat`/`currencyFormat`.
 */
@Component({
  selector: 'app-monthly-chart',
  imports: [VisXYContainerModule, VisGroupedBarModule, VisAxisModule, VisTooltipModule],
  templateUrl: './monthly-chart.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthlyChart {
  readonly months = input.required<MonthBucket[]>();
  readonly dateFormat = input.required<DateFormat>();
  readonly currencyFormat = input.required<CurrencyFormat>();

  protected readonly monthSeries = MONTH_SERIES;

  protected readonly monthLabels = computed(() =>
    this.months().map((bucket) => monthLabel(bucket.month, this.dateFormat())),
  );

  /** One tick per month, so every month in the period gets a label (business requirements §4.5, story 16). */
  protected readonly monthTickValues = computed(() => this.months().map((_, index) => index));

  protected readonly monthX = (_bucket: MonthBucket, index: number): number => index;
  protected readonly monthY = MONTH_SERIES.map((series) => series.value);
  protected readonly monthColor = (_bucket: MonthBucket, seriesIndex: number): string =>
    MONTH_SERIES[seriesIndex].color;

  /** Ticks are month indexes (0..n-1) — labels come from `monthLabels`, not the tick value. */
  protected readonly monthAxisTickFormat = (tick: number | Date): string =>
    this.monthLabels()[Number(tick)] ?? '';

  /** Y-axis ticks are amounts (income/expense share one scale), formatted per the selected currency preset. */
  protected readonly monthYAxisTickFormat = (tick: number | Date): string =>
    formatAmount(Number(tick), this.currencyFormat());

  protected readonly monthTooltipTriggers = {
    /**
     * Unovis's tooltip passes the hovered bar's index across *every* bar in
     * the component (all months flattened), not its index within its own
     * month's group — `% MONTH_SERIES.length` recovers the series (income
     * vs. expense) regardless of which month was hovered.
     */
    [GroupedBar.selectors.bar]: (bucket: MonthBucket, elementIndex: number): string => {
      const series = MONTH_SERIES[elementIndex % MONTH_SERIES.length];
      return `${series.label} : ${formatAmount(series.value(bucket), this.currencyFormat())}`;
    },
  };
}
