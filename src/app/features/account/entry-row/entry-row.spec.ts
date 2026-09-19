import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Entry } from '@data/entries/entries-api';
import { RowCategory, SYSTEM_CATEGORY, UNCATEGORIZED } from '../row-category';
import { EntryRow } from './entry-row';

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 1,
    account_id: 1,
    label: 'Courses',
    category_id: 1,
    date: '2026-02-01',
    amount: -25.5,
    description: '',
    is_system: false,
    reconciled: false,
    is_recurring: false,
    ...overrides,
  };
}

const ALIMENTATION: RowCategory = { name: 'Alimentation', color: '#10b981', icon: 'lucideTag' };

async function createEntryRow(
  value: Entry,
  category: RowCategory = value.is_system ? SYSTEM_CATEGORY : ALIMENTATION,
): Promise<ComponentFixture<EntryRow>> {
  await TestBed.configureTestingModule({ imports: [EntryRow] }).compileComponents();

  const fixture = TestBed.createComponent(EntryRow);
  fixture.componentRef.setInput('entry', value);
  fixture.componentRef.setInput('category', category);
  fixture.componentRef.setInput('accountColor', '#3b82f6');
  fixture.componentRef.setInput('dateFormat', 'DMY');
  fixture.componentRef.setInput('currencyFormat', 'SYMBOL_AFTER');
  fixture.detectChanges();
  return fixture;
}

function one(fixture: ComponentFixture<EntryRow>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

function textIn(fixture: ComponentFixture<EntryRow>, testId: string): string {
  return one(fixture, testId)?.textContent?.trim() ?? '';
}

describe('EntryRow', () => {
  it('renders the entry through the date and currency formats it is given', async () => {
    const fixture = await createEntryRow(entry({ date: '2026-02-01', amount: -25.5 }));

    expect(textIn(fixture, 'entry-date')).toBe('01/02/2026');
    expect(textIn(fixture, 'entry-amount')).toContain('25,50');
    expect(textIn(fixture, 'entry-amount')).toContain('€');
  });

  it('shows the label, description and category it is handed', async () => {
    const fixture = await createEntryRow(entry({ label: 'Courses', description: 'Samedi' }));

    expect(textIn(fixture, 'entry-label')).toBe('Courses');
    expect(textIn(fixture, 'entry-category')).toContain('Alimentation');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Samedi');
  });

  it('renders the system entry locked, with no reconcile or delete affordance', async () => {
    const fixture = await createEntryRow(entry({ is_system: true }));

    expect(one(fixture, 'entry-locked')).not.toBeNull();
    expect(one(fixture, 'entry-system-checkbox')).not.toBeNull();
    expect(one(fixture, 'entry-reconciled')).toBeNull();
    expect(one(fixture, 'entry-delete')).toBeNull();
    expect(textIn(fixture, 'entry-label')).toBe('Solde de départ');
  });

  it('shows the recurring icon on an entry a rule generated', async () => {
    const fixture = await createEntryRow(entry({ is_recurring: true }));
    expect(one(fixture, 'entry-recurring')).not.toBeNull();
  });

  it('shows no recurring icon on a manually entered entry', async () => {
    const fixture = await createEntryRow(entry({ is_recurring: false }));
    expect(one(fixture, 'entry-recurring')).toBeNull();
  });

  it('renders whatever category swatch it is given, uncategorized included', async () => {
    const fixture = await createEntryRow(entry({ category_id: null }), UNCATEGORIZED);

    expect(textIn(fixture, 'entry-category')).toContain(UNCATEGORIZED.name);
  });

  it('asks its container to toggle and to delete, without acting itself', async () => {
    const fixture = await createEntryRow(entry());
    let toggled = 0;
    let deletions = 0;
    fixture.componentInstance.reconciledToggled.subscribe(() => (toggled += 1));
    fixture.componentInstance.deleteRequested.subscribe(() => (deletions += 1));

    (one(fixture, 'entry-reconciled') as HTMLButtonElement).click();
    (one(fixture, 'entry-delete') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect([toggled, deletions]).toEqual([1, 1]);
    // The flag is the container's to flip: nothing changed on the row itself.
    expect(one(fixture, 'entry-reconciled')?.dataset['reconciled']).toBe('false');
  });

  it('keeps its buttons’ clicks from bubbling to the row’s edit target', async () => {
    const fixture = await createEntryRow(entry());
    let bubbled = 0;
    (fixture.nativeElement as HTMLElement).addEventListener('click', () => (bubbled += 1));

    (one(fixture, 'entry-reconciled') as HTMLButtonElement).click();
    (one(fixture, 'entry-delete') as HTMLButtonElement).click();

    expect(bubbled).toBe(0);
  });

  it('gives the checkbox a hit area wider than its visible box, so a near miss still toggles it', async () => {
    const fixture = await createEntryRow(entry());

    // Negative margins cancel the padding's contribution to the row's flex
    // flow, so the checkbox stays size-7 there while the button element
    // itself — the actual click target — covers the row's own left padding
    // and half the gap before the date column. See the template comment for
    // why.
    const button = one(fixture, 'entry-reconciled') as HTMLButtonElement;
    expect(button.className).toContain('-ml-5');
    expect(button.className).toContain('-mr-2');
    expect(button.className).toContain('self-stretch');
  });
});
