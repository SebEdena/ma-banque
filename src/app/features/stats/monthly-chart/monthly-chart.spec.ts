import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { VisGroupedBarComponent, VisXYContainerComponent } from '@unovis/angular';

import { MonthBucket } from '@data/statistics/statistics-api';
import '@core/testing/jsdom-polyfills';
import { MonthlyChart } from './monthly-chart';

function month(overrides: Partial<MonthBucket> = {}): MonthBucket {
  return {
    month: '2026-03',
    income: 2000,
    expense: 1500,
    ...overrides,
  };
}

async function createChart(months: MonthBucket[]): Promise<ComponentFixture<MonthlyChart>> {
  const fixture = TestBed.createComponent(MonthlyChart);
  fixture.componentRef.setInput('months', months);
  fixture.componentRef.setInput('dateFormat', 'DMY');
  fixture.componentRef.setInput('currencyFormat', 'SYMBOL_AFTER');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function one(fixture: ComponentFixture<MonthlyChart>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

describe('MonthlyChart', () => {
  it('feeds the GroupedBar component one data point per month, including zero-valued months, with both series populated', async () => {
    const months = [
      month({ month: '2026-01', income: 2000, expense: 1500 }),
      month({ month: '2026-02', income: 0, expense: 0 }),
    ];
    const fixture = await createChart(months);

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

  it('renders the Recettes/Dépenses legend', async () => {
    const fixture = await createChart([month()]);

    expect(one(fixture, 'monthly-legend')?.textContent).toContain('Recettes');
    expect(one(fixture, 'monthly-legend')?.textContent).toContain('Dépenses');
  });
});
