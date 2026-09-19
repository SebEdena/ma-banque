import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Category } from '@data/categories/categories-api';
import { RecurringRuleInput } from '@data/recurring-rules/recurring-rules-api';
import { RecurringRuleForm, RuleDraft, emptyDraft } from './recurring-rule-form';

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

async function createForm(
  draft: RuleDraft = emptyDraft(),
  categories: Category[] = [category()],
): Promise<ComponentFixture<RecurringRuleForm>> {
  await TestBed.configureTestingModule({ imports: [RecurringRuleForm] }).compileComponents();

  const fixture = TestBed.createComponent(RecurringRuleForm);
  fixture.componentRef.setInput('draft', draft);
  fixture.componentRef.setInput('categories', categories);
  fixture.detectChanges();
  return fixture;
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

function one(fixture: ComponentFixture<unknown>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

async function click(fixture: ComponentFixture<unknown>, testId: string): Promise<void> {
  (one(fixture, testId) as HTMLButtonElement).click();
  await settle(fixture);
}

describe('RecurringRuleForm', () => {
  it('emits the parsed wire payload once the draft is valid', async () => {
    const fixture = await createForm({ ...emptyDraft(), label: 'Loyer', amount: '-750' });
    let saved: RecurringRuleInput | undefined;
    fixture.componentInstance.saved.subscribe((input) => (saved = input));

    await click(fixture, 'recurring-save');

    expect(saved).toEqual(expect.objectContaining({ label: 'Loyer', amount: -750, interval: 1 }));
  });

  it('rejects a blank label inline, without emitting', async () => {
    const fixture = await createForm({ ...emptyDraft(), amount: '-750' });
    let saved = 0;
    fixture.componentInstance.saved.subscribe(() => (saved += 1));

    await click(fixture, 'recurring-save');

    expect(one(fixture, 'recurring-form-label-error')).not.toBeNull();
    expect(saved).toBe(0);
  });

  it('shows no error before a save has been attempted', async () => {
    const fixture = await createForm();

    expect(one(fixture, 'recurring-form-label-error')).toBeNull();
  });

  it('rewrites the amount’s sign through the débit/crédit selector', async () => {
    const fixture = await createForm({ ...emptyDraft(), amount: '750' });

    await click(fixture, 'recurring-form-debit');

    expect((one(fixture, 'recurring-form-amount') as HTMLInputElement).value).toBe('-750');
  });

  it('leaves an empty amount empty when Débit is picked, so every caret position stays typable', async () => {
    const fixture = await createForm({ ...emptyDraft(), amount: '' });

    await click(fixture, 'recurring-form-debit');

    // No stray sign character is written — the field stays empty rather than
    // landing on a lone `-` a caret placed before it couldn't type around.
    expect((one(fixture, 'recurring-form-amount') as HTMLInputElement).value).toBe('');
  });

  it('emits cancelled without touching the draft', async () => {
    const fixture = await createForm();
    let cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => (cancelled += 1));

    (one(fixture, 'recurring-cancel') as HTMLButtonElement).click();

    expect(cancelled).toBe(1);
  });

  it('rejects an interval below 1 inline, without emitting', async () => {
    const fixture = await createForm({
      ...emptyDraft(),
      label: 'Loyer',
      amount: '-750',
      interval: '0',
    });
    let saved = 0;
    fixture.componentInstance.saved.subscribe(() => (saved += 1));

    await click(fixture, 'recurring-save');

    expect(one(fixture, 'recurring-form-interval-error')).not.toBeNull();
    expect(saved).toBe(0);
  });

  it('rejects an end date before the start date inline, without emitting', async () => {
    const fixture = await createForm({
      ...emptyDraft(),
      label: 'Loyer',
      amount: '-750',
      startDate: '2026-03-10',
      endDate: '2026-03-01',
    });
    let saved = 0;
    fixture.componentInstance.saved.subscribe(() => (saved += 1));

    await click(fixture, 'recurring-save');

    expect(one(fixture, 'recurring-form-end-date-error')).not.toBeNull();
    expect(saved).toBe(0);
  });
});
