import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { toast } from '@spartan-ng/brain/sonner';
import {
  VisDonutComponent,
  VisGroupedBarComponent,
  VisSingleContainerComponent,
  VisXYContainerComponent,
} from '@unovis/angular';

import { AccountsApi } from '@data/accounts/accounts-api';
import { AccountsStore } from '@data/accounts/accounts-store';
import { accountFixture as account } from '@core/testing/account.fixture';
import { DisplaySettingsService } from '@core/display-settings/display-settings';
import {
  CategoryBreakdownBucket,
  CategoryBreakdownResponse,
  MonthBucket,
  MonthBucketedResponse,
  StatisticsApi,
} from '@data/statistics/statistics-api';
import '@core/testing/jsdom-polyfills';
import { Stats } from './stats';

function bucket(overrides: Partial<CategoryBreakdownBucket> = {}): CategoryBreakdownBucket {
  return {
    category_id: 1,
    name: 'Alimentation',
    color: '#10b981',
    icon: 'lucideShoppingCart',
    amount: 150,
    percentage: 60,
    ...overrides,
  };
}

function month(overrides: Partial<MonthBucket> = {}): MonthBucket {
  return {
    month: '2026-03',
    income: 2000,
    expense: 1500,
    ...overrides,
  };
}

interface StubStatisticsApi {
  categoryBreakdown: ReturnType<typeof vi.fn>;
  monthBucketed: ReturnType<typeof vi.fn>;
}

function stubStatisticsApi(
  breakdown: CategoryBreakdownResponse = { buckets: [bucket()], total_expenses: 250 },
  monthly: MonthBucketedResponse = { months: [month()] },
): StubStatisticsApi {
  return {
    categoryBreakdown: vi.fn().mockResolvedValue(breakdown),
    monthBucketed: vi.fn().mockResolvedValue(monthly),
  };
}

async function createStats(
  statisticsApi: StubStatisticsApi,
  accounts = [account({ id: 1, name: 'Compte Courant', color: '#3b82f6' })],
  accountId = 1,
): Promise<ComponentFixture<Stats>> {
  await TestBed.configureTestingModule({
    imports: [Stats],
    providers: [
      provideRouter([]),
      {
        provide: AccountsApi,
        useValue: {
          listActiveAccounts: vi.fn().mockResolvedValue(accounts),
          listArchivedAccounts: vi.fn().mockResolvedValue([]),
        },
      },
      { provide: StatisticsApi, useValue: statisticsApi },
      {
        provide: DisplaySettingsService,
        useValue: { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER') },
      },
    ],
  }).compileComponents();

  await TestBed.inject(AccountsStore).loaded;

  const fixture = TestBed.createComponent(Stats);
  fixture.componentRef.setInput('accountId', accountId);
  fixture.detectChanges();
  // Two rounds: the first lets the `effect()` kick off `load()`, the second
  // flushes the `Promise.all` it awaits and the signal writes that follow.
  await settle(fixture);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<Stats>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

function one(fixture: ComponentFixture<Stats>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

function all(fixture: ComponentFixture<Stats>, testId: string): HTMLElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`),
  );
}

async function click(fixture: ComponentFixture<Stats>, element: HTMLElement): Promise<void> {
  element.click();
  await settle(fixture);
  await settle(fixture);
}

describe('Stats', () => {
  it('requests both aggregates for the preselected account on load', async () => {
    const statisticsApi = stubStatisticsApi();
    await createStats(statisticsApi);

    expect(statisticsApi.categoryBreakdown).toHaveBeenCalledWith(1, 'THREE_MONTHS');
    expect(statisticsApi.monthBucketed).toHaveBeenCalledWith(1, 'THREE_MONTHS');
  });

  it('re-requests both aggregates with the new period when a preset is chosen', async () => {
    const statisticsApi = stubStatisticsApi();
    const fixture = await createStats(statisticsApi);

    await click(fixture, one(fixture, 'period-SIX_MONTHS')!);

    expect(statisticsApi.categoryBreakdown).toHaveBeenLastCalledWith(1, 'SIX_MONTHS');
    expect(statisticsApi.monthBucketed).toHaveBeenLastCalledWith(1, 'SIX_MONTHS');
  });

  it('re-requests both aggregates for the newly selected account, keeping the chosen period', async () => {
    const statisticsApi = stubStatisticsApi();
    const accounts = [
      account({ id: 1, name: 'Compte Courant', color: '#3b82f6' }),
      account({ id: 2, name: 'Livret A', color: '#10b981' }),
    ];
    const fixture = await createStats(statisticsApi, accounts);

    await click(fixture, one(fixture, 'period-ONE_MONTH')!);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await click(fixture, one(fixture, 'account-pill-2')!);

    expect(navigate).toHaveBeenCalledWith(['/stats', 2]);

    // Simulate the route re-preselecting account 2, as the real router would.
    fixture.componentRef.setInput('accountId', 2);
    await settle(fixture);
    await settle(fixture);

    expect(statisticsApi.categoryBreakdown).toHaveBeenLastCalledWith(2, 'ONE_MONTH');
    expect(statisticsApi.monthBucketed).toHaveBeenLastCalledWith(2, 'ONE_MONTH');
  });

  it('feeds the Donut component one data point per bucket with the expected colour and value', async () => {
    const buckets = [
      bucket({
        category_id: 1,
        name: 'Alimentation',
        color: '#10b981',
        amount: 150,
        percentage: 60,
      }),
      bucket({
        category_id: null,
        name: 'Sans poste',
        color: '#9ca3af',
        amount: 100,
        percentage: 40,
      }),
    ];
    const statisticsApi = stubStatisticsApi({ buckets, total_expenses: 250 });
    const fixture = await createStats(statisticsApi);

    const container = fixture.debugElement.query(By.directive(VisSingleContainerComponent))
      .componentInstance as VisSingleContainerComponent<CategoryBreakdownBucket[]>;
    expect(container.data).toEqual(buckets);

    const donut = fixture.debugElement.query(By.directive(VisDonutComponent))
      .componentInstance as VisDonutComponent<CategoryBreakdownBucket>;
    const donutColor = donut.color as (d: CategoryBreakdownBucket, i: number) => string;
    const donutValue = donut.value as (d: CategoryBreakdownBucket, i: number) => number;
    expect(buckets.map((b, i) => donutColor(b, i))).toEqual(['#10b981', '#9ca3af']);
    expect(buckets.map((b, i) => donutValue(b, i))).toEqual([150, 100]);
    expect(donut.centralSubLabel).toBe('Total dépenses');
  });

  it('renders the hand-built legend with one row per bucket carrying the returned colour, name, percentage and amount', async () => {
    const buckets = [
      bucket({
        category_id: 1,
        name: 'Alimentation',
        color: '#10b981',
        amount: 150,
        percentage: 60,
      }),
      bucket({
        category_id: null,
        name: 'Sans poste',
        color: '#9ca3af',
        amount: 100,
        percentage: 40,
      }),
    ];
    const statisticsApi = stubStatisticsApi({ buckets, total_expenses: 250 });
    const fixture = await createStats(statisticsApi);

    const rows = all(fixture, 'legend-row');
    expect(rows).toHaveLength(2);

    const first = rows[0];
    expect(first.querySelector('[data-testid="legend-name"]')?.textContent).toContain(
      'Alimentation',
    );
    expect(first.querySelector('[data-testid="legend-percentage"]')?.textContent).toContain('60');
    expect(first.querySelector('[data-testid="legend-amount"]')?.textContent).toContain('150');
    expect(
      (first.querySelector('[data-testid="legend-swatch"]') as HTMLElement).style.backgroundColor,
    ).toBeTruthy();

    const second = rows[1];
    expect(second.querySelector('[data-testid="legend-name"]')?.textContent).toContain(
      'Sans poste',
    );
  });

  it('renders the empty state when the breakdown comes back empty', async () => {
    const statisticsApi = stubStatisticsApi({ buckets: [], total_expenses: 0 });
    const fixture = await createStats(statisticsApi);

    expect(one(fixture, 'breakdown-empty')?.textContent).toContain(
      'Aucune dépense sur cette période.',
    );
    expect(one(fixture, 'donut-chart')).toBeNull();
  });

  it('feeds the GroupedBar component one data point per month, including zero-valued months, with both series populated', async () => {
    const months = [
      month({ month: '2026-01', income: 2000, expense: 1500 }),
      month({ month: '2026-02', income: 0, expense: 0 }),
    ];
    const statisticsApi = stubStatisticsApi(undefined, { months });
    const fixture = await createStats(statisticsApi);

    const container = fixture.debugElement.query(By.directive(VisXYContainerComponent))
      .componentInstance as VisXYContainerComponent<MonthBucket>;
    expect(container.data).toEqual(months);

    const groupedBar = fixture.debugElement.query(By.directive(VisGroupedBarComponent))
      .componentInstance as VisGroupedBarComponent<MonthBucket>;
    const [incomeAccessor, expenseAccessor] = groupedBar.y as ((
      d: MonthBucket,
      i: number,
    ) => number)[];

    expect(months.map((m, i) => incomeAccessor(m, i))).toEqual([2000, 0]);
    expect(months.map((m, i) => expenseAccessor(m, i))).toEqual([1500, 0]);
    const barColor = groupedBar.color as (d: MonthBucket, i: number) => string;
    expect(barColor(months[0], 0)).toBe('var(--positive)');
    expect(barColor(months[0], 1)).toBe('var(--negative)');
  });

  it('surfaces a failing aggregate request as a toast', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '');
    const statisticsApi: StubStatisticsApi = {
      categoryBreakdown: vi.fn().mockRejectedValue({ kind: 'NotFound' }),
      monthBucketed: vi.fn().mockResolvedValue({ months: [] }),
    };

    await createStats(statisticsApi);

    expect(error).toHaveBeenCalledWith("ce compte n'existe plus");
  });
});
