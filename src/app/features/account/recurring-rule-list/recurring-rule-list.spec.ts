import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Category } from '@data/categories/categories-api';
import { RecurringRule } from '@data/recurring-rules/recurring-rules-api';
import { RecurringRuleList } from './recurring-rule-list';

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 1,
    account_id: 1,
    label: 'Loyer',
    category_id: 1,
    amount: -750,
    description: '',
    frequency: 'MONTHLY',
    interval: 1,
    start_date: '2026-03-01',
    end_date: null,
    ...overrides,
  };
}

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Logement',
    color: '#3b82f6',
    icon: 'lucideHouse',
    description: '',
    usage_count: 0,
    ...overrides,
  };
}

async function createList(
  rules: RecurringRule[],
  categories: Category[] = [category()],
): Promise<ComponentFixture<RecurringRuleList>> {
  await TestBed.configureTestingModule({ imports: [RecurringRuleList] }).compileComponents();

  const fixture = TestBed.createComponent(RecurringRuleList);
  fixture.componentRef.setInput('rules', rules);
  fixture.componentRef.setInput('categories', categories);
  fixture.componentRef.setInput('currencyFormat', 'SYMBOL_AFTER');
  fixture.componentRef.setInput('dateFormat', 'DMY');
  fixture.detectChanges();
  return fixture;
}

function one(fixture: ComponentFixture<unknown>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

function all(fixture: ComponentFixture<unknown>, testId: string): HTMLElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`),
  );
}

describe('RecurringRuleList', () => {
  it('shows the empty state and no rows when there are no rules', async () => {
    const fixture = await createList([]);

    expect(one(fixture, 'recurring-empty')).not.toBeNull();
    expect(all(fixture, 'recurring-row')).toHaveLength(0);
  });

  it('renders one row per rule, with its schedule and date range', async () => {
    const fixture = await createList([
      rule({ id: 7, frequency: 'MONTHLY', interval: 1, start_date: '2026-03-01' }),
    ]);

    expect(one(fixture, 'recurring-empty')).toBeNull();
    expect(all(fixture, 'recurring-row')).toHaveLength(1);
    expect(one(fixture, 'recurring-row-schedule')?.textContent).toContain('Tous les mois');
  });

  it('renders a daily schedule as "Tous les jours" (or "Tous les X jours")', async () => {
    const fixture = await createList([
      rule({ id: 7, frequency: 'DAILY', interval: 1 }),
      rule({ id: 8, frequency: 'DAILY', interval: 3 }),
    ]);

    const schedules = all(fixture, 'recurring-row-schedule').map((el) => el.textContent);
    expect(schedules[0]).toContain('Tous les jours');
    expect(schedules[1]).toContain('Tous les 3 jours');
  });

  it('emits which rule an edit or delete click landed on, without acting itself', async () => {
    const fixture = await createList([rule({ id: 7 })]);
    let edited: RecurringRule | undefined;
    let deleted: RecurringRule | undefined;
    fixture.componentInstance.edit.subscribe((rule) => (edited = rule));
    fixture.componentInstance.delete.subscribe((rule) => (deleted = rule));

    (one(fixture, 'recurring-edit') as HTMLButtonElement).click();
    (one(fixture, 'recurring-delete') as HTMLButtonElement).click();

    expect(edited?.id).toBe(7);
    expect(deleted?.id).toBe(7);
  });

  it('falls back to the uncategorized swatch for a rule whose category is gone', async () => {
    const fixture = await createList([rule({ category_id: null })], []);

    expect(one(fixture, 'recurring-row-category')).not.toBeNull();
  });
});
