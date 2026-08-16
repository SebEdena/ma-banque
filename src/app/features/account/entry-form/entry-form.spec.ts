import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideBrnCalendarI18n } from '@spartan-ng/brain/calendar';
import { provideNativeDateAdapter } from '@spartan-ng/brain/date-time';

import { Category } from '@core/categories-api/categories-api';
import { FRENCH_CALENDAR_I18N } from '@core/display-settings/calendar-i18n';
import '@core/testing/jsdom-polyfills';
import { EntryDraft, EntryForm, EntryFormField } from './entry-form';

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
  focusField?: EntryFormField,
): Promise<ComponentFixture<EntryForm>> {
  await TestBed.configureTestingModule({
    imports: [EntryForm],
    providers: [provideNativeDateAdapter(), provideBrnCalendarI18n(FRENCH_CALENDAR_I18N)],
  }).compileComponents();

  const fixture = TestBed.createComponent(EntryForm);
  fixture.componentRef.setInput('draft', value);
  fixture.componentRef.setInput('categories', categories);
  fixture.componentRef.setInput('accountColor', '#3b82f6');
  fixture.componentRef.setInput('reconciled', false);
  // YMD matches the ISO `YYYY-MM-DD` fixture dates below, so the picker's
  // display format doesn't need its own conversion in every assertion.
  fixture.componentRef.setInput('dateFormat', 'YMD');
  if (focusField !== undefined) {
    fixture.componentRef.setInput('focusField', focusField);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function one(fixture: ComponentFixture<EntryForm>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

/**
 * `hlm-date-picker-input` renders its actual `<input>` inside its own
 * template, keyed by `inputId` rather than a `data-testid` `one` could
 * reach — so the date field is found by that id instead.
 */
function dateInput(fixture: ComponentFixture<EntryForm>): HTMLInputElement {
  return (fixture.nativeElement as HTMLElement).querySelector(
    '#entry-form-date',
  ) as HTMLInputElement;
}

function type(fixture: ComponentFixture<EntryForm>, testId: string, value: string): void {
  const input = one(fixture, testId) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function save(fixture: ComponentFixture<EntryForm>): Promise<void> {
  (one(fixture, 'entry-save') as HTMLButtonElement).click();
  await fixture.whenStable();
  fixture.detectChanges();
}

/**
 * `hlm-select`'s dropdown is a `hlm-select-item` list portaled to
 * `document.body` — reachable by `data-testid`, but only while open — rather
 * than a native `<select>`'s options. Opens the trigger, clicks the item,
 * and lets the (default) auto-close on select settle.
 */
function selectCategory(fixture: ComponentFixture<EntryForm>, itemTestId: string): void {
  one(fixture, 'entry-form-category')?.querySelector('button')?.click();
  fixture.detectChanges();
  (document.querySelector(`[data-testid="${itemTestId}"]`) as HTMLElement).click();
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
    expect(dateInput(fixture).value).toBe('2026-03-05');
    expect(one(fixture, 'entry-form-category')?.textContent?.trim()).toBe('Alimentation');
  });

  it('writes every edited field back through the draft model', async () => {
    const fixture = await createEntryForm();
    const seen: EntryDraft[] = [];
    fixture.componentInstance.draft.subscribe((value) => seen.push(value));

    type(fixture, 'entry-form-label', 'Boulangerie');
    type(fixture, 'entry-form-description', 'Pain');
    type(fixture, 'entry-form-amount', '-12.40');
    selectCategory(fixture, 'entry-form-category-option-1');

    expect(seen.at(-1)).toMatchObject({
      label: 'Boulangerie',
      description: 'Pain',
      amount: '-12.40',
      categoryId: 1,
    });
  });

  it('flips the type selector with the amount’s sign, in both directions', async () => {
    const fixture = await createEntryForm(draft({ amount: '' }));

    type(fixture, 'entry-form-amount', '30');
    expect(one(fixture, 'entry-form-credit')?.dataset['selected']).toBe('true');

    type(fixture, 'entry-form-amount', '-30');
    expect(one(fixture, 'entry-form-debit')?.dataset['selected']).toBe('true');

    (one(fixture, 'entry-form-credit') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((one(fixture, 'entry-form-amount') as HTMLInputElement).value).toBe('30');
  });

  it('renders a lone sign as-is, since the field is a plain text input now', async () => {
    const fixture = await createEntryForm(draft({ amount: '-' }));

    expect((one(fixture, 'entry-form-amount') as HTMLInputElement).value).toBe('-');
    expect(one(fixture, 'entry-form-debit')?.dataset['selected']).toBe('true');
  });

  it('picking Débit on an empty draft shows the sign the next digits land after', async () => {
    const fixture = await createEntryForm(draft({ amount: '' }));

    (one(fixture, 'entry-form-debit') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect((one(fixture, 'entry-form-amount') as HTMLInputElement).value).toBe('-');

    type(fixture, 'entry-form-amount', '-30');
    expect((one(fixture, 'entry-form-amount') as HTMLInputElement).value).toBe('-30');
  });

  it('accepts the fr-FR decimal comma the same as a dot', async () => {
    const fixture = await createEntryForm(draft({ label: 'Courses', amount: '' }));
    const amounts: number[] = [];
    fixture.componentInstance.saved.subscribe((amount) => amounts.push(amount));

    type(fixture, 'entry-form-amount', '-12,40');
    await save(fixture);

    expect(amounts).toEqual([-12.4]);
  });

  it('treats the quick-create option as a trigger, not a value', async () => {
    const fixture = await createEntryForm(draft({ categoryId: 1 }));
    let requested = 0;
    fixture.componentInstance.categoryCreateRequested.subscribe(() => (requested += 1));

    selectCategory(fixture, 'entry-form-category-new');

    expect(requested).toBe(1);
    // The field goes back to what it showed, so cancelling the modal that the
    // container opens doesn't leave it on a non-category.
    expect(one(fixture, 'entry-form-category')?.textContent?.trim()).toBe('Alimentation');
  });

  it('holds an empty label back, inline, only once a save has been attempted', async () => {
    const fixture = await createEntryForm(draft({ amount: '-12.40' }));
    let saves = 0;
    fixture.componentInstance.saved.subscribe(() => (saves += 1));
    expect(one(fixture, 'entry-form-label-error')).toBeNull();

    await save(fixture);

    expect(saves).toBe(0);
    expect(one(fixture, 'entry-form-label-error')?.textContent?.trim()).toBe('Libellé obligatoire');
  });

  it('holds an unreadable amount back, inline and as a toast the container owns', async () => {
    const fixture = await createEntryForm(draft({ label: 'Courses' }));
    let rejected = 0;
    fixture.componentInstance.amountRejected.subscribe(() => (rejected += 1));
    // The row opens on a lone sign, which isn't a number yet.
    expect(one(fixture, 'entry-form-amount-error')).toBeNull();

    await save(fixture);

    expect(rejected).toBe(1);
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

  it('opens focused on the date field', async () => {
    const fixture = await createEntryForm(draft(), [category()], 'date');
    expect(document.activeElement).toBe(dateInput(fixture));
  });

  it('opens focused on the field the container asked for', async () => {
    for (const [field, testId] of [
      ['category', 'entry-form-category'],
      ['amount', 'entry-form-amount'],
    ] as const) {
      TestBed.resetTestingModule();
      const fixture = await createEntryForm(draft(), [category()], field);
      const target = one(fixture, testId);
      // The category select's focusable control is its trigger `<button>`,
      // nested inside the element `data-testid` reaches.
      expect(document.activeElement).toBe(target?.querySelector('button') ?? target);
    }
  });

  it('opens focused on the label by default, with its text selected', async () => {
    const fixture = await createEntryForm(draft({ label: 'Courses' }));
    const label = one(fixture, 'entry-form-label') as HTMLInputElement;

    expect(document.activeElement).toBe(label);
    expect(label.selectionEnd).toBe('Courses'.length);
  });

  it('emits the parsed amount on save, and disables saving while one is in flight', async () => {
    const fixture = await createEntryForm(draft({ label: 'Courses', amount: '-12.40' }));
    const amounts: number[] = [];
    let cancels = 0;
    fixture.componentInstance.saved.subscribe((amount) => amounts.push(amount));
    fixture.componentInstance.cancelled.subscribe(() => (cancels += 1));

    await save(fixture);
    (one(fixture, 'entry-cancel') as HTMLButtonElement).click();
    expect([amounts, cancels]).toEqual([[-12.4], 1]);

    fixture.componentRef.setInput('saving', true);
    fixture.detectChanges();

    expect((one(fixture, 'entry-save') as HTMLButtonElement).disabled).toBe(true);
  });
});
