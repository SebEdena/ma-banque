import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';

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

  it('passes the fetched breakdown and month data down to the two chart components', async () => {
    const buckets = [bucket({ name: 'Alimentation', amount: 150 })];
    const months = [month({ month: '2026-01' })];
    const statisticsApi = stubStatisticsApi({ buckets, total_expenses: 150 }, { months });
    const fixture = await createStats(statisticsApi);

    expect(one(fixture, 'breakdown-legend')?.textContent).toContain('Alimentation');
    expect(one(fixture, 'monthly-chart')).not.toBeNull();
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
