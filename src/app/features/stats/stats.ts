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

import { Account } from '@data/accounts/accounts-api';
import { AccountsStore } from '@data/accounts/accounts-store';
import { DisplaySettingsService } from '@core/display-settings/display-settings';
import {
  CategoryBreakdownBucket,
  MonthBucket,
  PeriodPreset,
  StatisticsApi,
  parseStatisticsError,
} from '@data/statistics/statistics-api';
import { AccountPills } from './account-pills/account-pills';
import { BreakdownChart } from './breakdown-chart/breakdown-chart';
import { MonthlyChart } from './monthly-chart/monthly-chart';

/** The four presets, in display order, with their French labels. */
const PERIOD_PRESETS: readonly { preset: PeriodPreset; label: string }[] = [
  { preset: 'ONE_MONTH', label: '1 mois' },
  { preset: 'THREE_MONTHS', label: '3 mois' },
  { preset: 'SIX_MONTHS', label: '6 mois' },
  { preset: 'TWELVE_MONTHS', label: '12 mois' },
];

/**
 * The Statistics screen (business requirements §4.5, `docs/spec/09-statistics.md`):
 * account-scoped breakdown of expenses by _Poste_ (`BreakdownChart`) and a
 * month-by-month _Recettes_/_Dépenses_ comparison (`MonthlyChart`), over a
 * selectable period. The period choice persists across account switches; the
 * selected account's colour drives the screen's interactive elements, the
 * same convention `Account` uses (see `../account/accent.css`, shared here
 * rather than duplicated).
 *
 * A container: this component owns fetching both aggregates and the
 * account/period selection state. The donut, the grouped-bar chart and the
 * account switcher are each their own presentational component — see
 * `breakdown-chart/`, `monthly-chart/` and `account-pills/`.
 */
@Component({
  selector: 'app-stats',
  imports: [NgIcon, RouterLink, AccountPills, BreakdownChart, MonthlyChart],
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
  protected readonly total = signal(0);
  protected readonly creditBuckets = signal<CategoryBreakdownBucket[]>([]);
  protected readonly totalCredits = signal(0);
  protected readonly months = signal<MonthBucket[]>([]);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);

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

  private async load(accountId: number, preset: PeriodPreset): Promise<void> {
    this.loading.set(true);
    try {
      const [breakdown, creditBreakdown, monthly] = await Promise.all([
        this.statisticsApi.categoryBreakdown(accountId, preset),
        this.statisticsApi.creditBreakdown(accountId, preset),
        this.statisticsApi.monthBucketed(accountId, preset),
      ]);
      this.buckets.set(breakdown.buckets);
      this.total.set(breakdown.total);
      this.creditBuckets.set(creditBreakdown.buckets);
      this.totalCredits.set(creditBreakdown.total);
      this.months.set(monthly.months);
      this.loaded.set(true);
    } catch (error) {
      toast.error(parseStatisticsError(error));
    } finally {
      this.loading.set(false);
    }
  }
}
