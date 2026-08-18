import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { VisDonutComponent, VisSingleContainerComponent } from '@unovis/angular';

import { CategoryBreakdownBucket } from '@data/statistics/statistics-api';
import '@core/testing/jsdom-polyfills';
import { BreakdownChart } from './breakdown-chart';

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

async function createChart(
  buckets: CategoryBreakdownBucket[],
  totalExpenses: number,
  loaded = true,
): Promise<ComponentFixture<BreakdownChart>> {
  const fixture = TestBed.createComponent(BreakdownChart);
  fixture.componentRef.setInput('buckets', buckets);
  fixture.componentRef.setInput('totalExpenses', totalExpenses);
  fixture.componentRef.setInput('loaded', loaded);
  fixture.componentRef.setInput('currencyFormat', 'SYMBOL_AFTER');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function one(fixture: ComponentFixture<BreakdownChart>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

function all(fixture: ComponentFixture<BreakdownChart>, testId: string): HTMLElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`),
  );
}

describe('BreakdownChart', () => {
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
    const fixture = await createChart(buckets, 250);

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

  it('renders the hand-built legend with one row per bucket carrying the colour, name, percentage and amount', async () => {
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
    const fixture = await createChart(buckets, 250);

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

  it('renders the empty state once loaded with no buckets', async () => {
    const fixture = await createChart([], 0, true);

    expect(one(fixture, 'breakdown-empty')?.textContent).toContain(
      'Aucune dépense sur cette période.',
    );
    expect(one(fixture, 'donut-chart')).toBeNull();
  });

  it('shows neither the chart nor the empty state before the first load completes', async () => {
    const fixture = await createChart([], 0, false);

    expect(one(fixture, 'breakdown-empty')).toBeNull();
    expect(one(fixture, 'donut-chart')).toBeNull();
  });
});
