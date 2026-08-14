import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Category } from '@core/categories-api/categories-api';
import { EntryDraft, EntryForm, NEW_CATEGORY_VALUE } from './entry-form';

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Alimentation',
    color: '#10b981',
    icon: 'lucideTag',
    description: '',
    usage_count: 0,
    ...overrides,
  };
}

function draft(overrides: Partial<EntryDraft> = {}): EntryDraft {
  return {
    label: '',
    description: '',
    date: '2026-03-05',
    categoryId: null,
    amount: '-',
    ...overrides,
  };
}

async function createEntryForm(
  value: EntryDraft = draft(),
  categories: Category[] = [category()],
): Promise<ComponentFixture<EntryForm>> {
  await TestBed.configureTestingModule({ imports: [EntryForm] }).compileComponents();

  const fixture = TestBed.createComponent(EntryForm);
  fixture.componentRef.setInput('draft', value);
  fixture.componentRef.setInput('categories', categories);
  fixture.componentRef.setInput('accountColor', '#3b82f6');
  fixture.componentRef.setInput('reconciled', false);
  fixture.detectChanges();
  return fixture;
}

function one(fixture: ComponentFixture<EntryForm>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

function type(fixture: ComponentFixture<EntryForm>, testId: string, value: string): void {
  const input = one(fixture, testId) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function select(fixture: ComponentFixture<EntryForm>, value: string): void {
  const element = one(fixture, 'entry-form-category') as HTMLSelectElement;
  element.value = value;
  element.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

describe('EntryForm', () => {
  it('renders the draft it is given into its fields', async () => {
    const fixture = await createEntryForm(
      draft({ label: 'Courses', description: 'Samedi', amount: '-25.5', categoryId: 1 }),
    );

    expect((one(fixture, 'entry-form-label') as HTMLInputElement).value).toBe('Courses');
    expect((one(fixture, 'entry-form-description') as HTMLInputElement).value).toBe('Samedi');
    expect((one(fixture, 'entry-form-amount') as HTMLInputElement).value).toBe('-25.5');
    expect((one(fixture, 'entry-form-date') as HTMLInputElement).value).toBe('2026-03-05');
    expect((one(fixture, 'entry-form-category') as HTMLSelectElement).value).toBe('1');
  });

  it('writes every edited field back through the draft model', async () => {
    const fixture = await createEntryForm();
    const seen: EntryDraft[] = [];
    fixture.componentInstance.draft.subscribe((value) => seen.push(value));

    type(fixture, 'entry-form-label', 'Boulangerie');
    type(fixture, 'entry-form-description', 'Pain');
    type(fixture, 'entry-form-amount', '-12.40');
    select(fixture, '1');

    expect(seen.at(-1)).toMatchObject({
      label: 'Boulangerie',
      description: 'Pain',
      amount: '-12.40',
      categoryId: 1,
    });
  });

  it('flips the type selector with the amount’s sign, in both directions', async () => {
    const fixture = await createEntryForm();

    type(fixture, 'entry-form-amount', '30');
    expect(one(fixture, 'entry-form-credit')?.dataset['selected']).toBe('true');

    type(fixture, 'entry-form-amount', '-30');
    expect(one(fixture, 'entry-form-debit')?.dataset['selected']).toBe('true');

    (one(fixture, 'entry-form-credit') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((one(fixture, 'entry-form-amount') as HTMLInputElement).value).toBe('30');
  });

  it('treats the quick-create option as a trigger, not a value', async () => {
    const fixture = await createEntryForm(draft({ categoryId: 1 }));
    let requested = 0;
    fixture.componentInstance.categoryCreateRequested.subscribe(() => (requested += 1));

    select(fixture, NEW_CATEGORY_VALUE);

    expect(requested).toBe(1);
    // The field goes back to what it showed, so cancelling the modal that the
    // container opens doesn't leave it on a non-category.
    expect((one(fixture, 'entry-form-category') as HTMLSelectElement).value).toBe('1');
  });

  it('shows the label error only when the container says the label is missing', async () => {
    const fixture = await createEntryForm();
    expect(one(fixture, 'entry-form-label-error')).toBeNull();

    fixture.componentRef.setInput('labelError', true);
    fixture.detectChanges();

    expect(one(fixture, 'entry-form-label-error')).not.toBeNull();
  });

  it('shows the amount error only when the container says the amount is invalid', async () => {
    const fixture = await createEntryForm();
    expect(one(fixture, 'entry-form-amount-error')).toBeNull();

    fixture.componentRef.setInput('amountError', true);
    fixture.detectChanges();

    expect(one(fixture, 'entry-form-amount-error')?.textContent?.trim()).toBe('Montant invalide');
    expect((one(fixture, 'entry-form-amount') as HTMLInputElement).className).toContain(
      'border-destructive',
    );
  });

  it('shows the reconciled flag it is given and only asks for it to be toggled', async () => {
    const fixture = await createEntryForm();
    let toggled = 0;
    fixture.componentInstance.reconciledToggled.subscribe(() => (toggled += 1));

    (one(fixture, 'entry-form-reconciled') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(toggled).toBe(1);
    expect(one(fixture, 'entry-form-reconciled')?.getAttribute('aria-checked')).toBe('false');
  });

  it('emits save and cancel, and disables saving while a save is in flight', async () => {
    const fixture = await createEntryForm();
    let saves = 0;
    let cancels = 0;
    fixture.componentInstance.saved.subscribe(() => (saves += 1));
    fixture.componentInstance.cancelled.subscribe(() => (cancels += 1));

    (one(fixture, 'entry-save') as HTMLButtonElement).click();
    (one(fixture, 'entry-cancel') as HTMLButtonElement).click();
    expect([saves, cancels]).toEqual([1, 1]);

    fixture.componentRef.setInput('saving', true);
    fixture.detectChanges();

    expect((one(fixture, 'entry-save') as HTMLButtonElement).disabled).toBe(true);
  });
});
