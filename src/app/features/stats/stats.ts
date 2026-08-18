import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  numberAttribute,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBarChart3, lucideWallet } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import {
  VisAxisModule,
  VisDonutModule,
  VisGroupedBarModule,
  VisSingleContainerModule,
  VisTooltipModule,
  VisXYContainerModule,
} from '@unovis/angular';
import { GroupedBar } from '@unovis/ts';

import { Account } from '@data/accounts/accounts-api';
import { AccountsStore } from '@data/accounts/accounts-store';
import { CurrencyFormatPipe } from '@core/display-settings/currency-format.pipe';
import { DisplaySettingsService } from '@core/display-settings/display-settings';
import type { DateFormat } from '@core/display-settings/display-settings.types';
import { formatAmount } from '@core/display-settings/format';
import {
  CategoryBreakdownBucket,
  MonthBucket,
  PeriodPreset,
  StatisticsApi,
  parseStatisticsError,
} from '@data/statistics/statistics-api';

/** The four presets, in display order, with their French labels. */
const PERIOD_PRESETS: readonly { preset: PeriodPreset; label: string }[] = [
  { preset: 'ONE_MONTH', label: '1 mois' },
  { preset: 'THREE_MONTHS', label: '3 mois' },
  { preset: 'SIX_MONTHS', label: '6 mois' },
  { preset: 'TWELVE_MONTHS', label: '12 mois' },
];

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
 * The Statistics screen (business requirements §4.5, `docs/spec/09-statistics.md`):
 * account-scoped breakdown of expenses by _Poste_ (Unovis `Donut`) and a
 * month-by-month _Recettes_/_Dépenses_ comparison (Unovis `GroupedBar` inside
 * an `XYContainer`), over a selectable period. The period choice persists
 * across account switches; the selected account's colour drives the screen's
 * interactive elements, the same convention `Account` uses (see
 * `../account/accent.css`, shared here rather than duplicated).
 */
@Component({
  selector: 'app-stats',
  imports: [
    NgIcon,
    RouterLink,
    CurrencyFormatPipe,
    VisDonutModule,
    VisSingleContainerModule,
    VisXYContainerModule,
    VisGroupedBarModule,
    VisAxisModule,
    VisTooltipModule,
  ],
  templateUrl: './stats.html',
  styleUrls: ['./stats.css', '../account/accent.css'],
  providers: [
    provideIcons({
      lucideBarChart3,
      lucideWallet,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Stats {
  private readonly accountsStore = inject(AccountsStore);
  private readonly statisticsApi = inject(StatisticsApi);
  private readonly router = inject(Router);

  protected readonly displaySettings = inject(DisplaySettingsService);

  readonly accountId = input.required({ transform: numberAttribute });

  protected readonly periods = PERIOD_PRESETS;

  /** Accounts a pill can switch to — active accounts, per the home screen's default view. */
  protected readonly accounts = this.accountsStore.active;

  protected readonly account = computed<Account | null>(
    () =>
      [...this.accountsStore.active(), ...this.accountsStore.archived()].find(
        (candidate) => candidate.id === this.accountId(),
      ) ?? null,
  );

  /** Persists across an account switch — a separate signal from the routed `accountId`. */
  protected readonly selectedPeriod = signal<PeriodPreset>('THREE_MONTHS');

  protected readonly buckets = signal<CategoryBreakdownBucket[]>([]);
  protected readonly totalExpenses = signal(0);
  protected readonly months = signal<MonthBucket[]>([]);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);

  protected readonly hasBreakdown = computed(() => this.buckets().length > 0);
  protected readonly showEmptyBreakdown = computed(() => this.loaded() && !this.hasBreakdown());

  protected readonly centralSubLabel = 'Total dépenses';

  protected readonly monthSeries = MONTH_SERIES;

  protected readonly monthLabels = computed(() =>
    this.months().map((bucket) => monthLabel(bucket.month, this.displaySettings.dateFormat())),
  );

  /** One tick per month, so every month in the period gets a label (business requirements §4.5, story 16). */
  protected readonly monthTickValues = computed(() => this.months().map((_, index) => index));

  protected readonly donutColor = (bucket: CategoryBreakdownBucket): string => bucket.color;
  protected readonly donutValue = (bucket: CategoryBreakdownBucket): number => bucket.amount;

  protected readonly monthX = (_bucket: MonthBucket, index: number): number => index;
  protected readonly monthY = MONTH_SERIES.map((series) => series.value);
  protected readonly monthColor = (_bucket: MonthBucket, seriesIndex: number): string =>
    MONTH_SERIES[seriesIndex].color;

  /** Ticks are month indexes (0..n-1) — labels come from `monthLabels`, not the tick value. */
  protected readonly monthAxisTickFormat = (tick: number | Date): string =>
    this.monthLabels()[Number(tick)] ?? '';

  protected readonly monthTooltipTriggers = {
    [GroupedBar.selectors.bar]: (bucket: MonthBucket, seriesIndex: number): string => {
      const series = MONTH_SERIES[seriesIndex];
      return `${series.label} : ${this.formatAmount(series.value(bucket))}`;
    },
  };

  constructor() {
    effect(() => {
      // Re-requests both aggregates whenever the account or the period changes.
      const account = this.account();
      const preset = this.selectedPeriod();
      if (account === null) {
        return;
      }
      void this.load(account.id, preset);
    });
  }

  protected selectPeriod(preset: PeriodPreset): void {
    this.selectedPeriod.set(preset);
  }

  protected selectAccount(account: Account): void {
    void this.router.navigate(['/stats', account.id]);
  }

  protected formatAmount(amount: number): string {
    return formatAmount(amount, this.displaySettings.currencyFormat());
  }

  private async load(accountId: number, preset: PeriodPreset): Promise<void> {
    this.loading.set(true);
    try {
      const [breakdown, monthly] = await Promise.all([
        this.statisticsApi.categoryBreakdown(accountId, preset),
        this.statisticsApi.monthBucketed(accountId, preset),
      ]);
      this.buckets.set(breakdown.buckets);
      this.totalExpenses.set(breakdown.total_expenses);
      this.months.set(monthly.months);
      this.loaded.set(true);
    } catch (error) {
      toast.error(parseStatisticsError(error));
    } finally {
      this.loading.set(false);
    }
  }
}
