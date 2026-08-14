import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AccountsApi } from '@core/accounts-api/accounts-api';
import { AccountsStore } from '@core/accounts-api/accounts-store';
import { CategoriesApi, Category } from '@core/categories-api/categories-api';
import { DisplaySettingsService } from '@core/display-settings/display-settings';
import { EntriesApi, Entry, ListEntriesQuery } from '@core/entries-api/entries-api';
import { accountFixture } from '@core/testing/account.fixture';
import { Account } from './account';

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
    ...overrides,
  };
}

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Alimentation',
    color: '#10b981',
    icon: 'lucideShoppingCart',
    description: '',
    usage_count: 0,
    ...overrides,
  };
}

interface StubEntriesApi {
  listEntries: ReturnType<typeof vi.fn>;
  createEntry: ReturnType<typeof vi.fn>;
  updateEntry: ReturnType<typeof vi.fn>;
  deleteEntry: ReturnType<typeof vi.fn>;
  setReconciled: ReturnType<typeof vi.fn>;
}

/** Pages, filters and sorts like the backend does, so the screen's requests round-trip honestly. */
function stubEntriesApi(entries: Entry[]): StubEntriesApi {
  return {
    createEntry: vi.fn().mockResolvedValue(entry({ id: 999 })),
    updateEntry: vi.fn().mockResolvedValue(entry()),
    deleteEntry: vi.fn().mockResolvedValue(undefined),
    setReconciled: vi.fn((id: number, reconciled: boolean) =>
      Promise.resolve(entry({ ...entries.find((candidate) => candidate.id === id), reconciled })),
    ),
    listEntries: vi.fn((_accountId: number, query: ListEntriesQuery) => {
      const matching = entries
        .filter(
          (candidate) =>
            candidate.is_system ||
            ((query.from === null || candidate.date >= query.from) &&
              (query.to === null || candidate.date <= query.to)),
        )
        .sort((a, b) => {
          const order = a.date.localeCompare(b.date) || a.id - b.id;
          return query.sort === 'ASC' ? order : -order;
        });

      return Promise.resolve({
        entries: matching.slice(query.offset, query.offset + query.page_size),
        has_more: matching.length > query.offset + query.page_size,
      });
    }),
  };
}

interface StubCategoriesApi {
  listCategories: ReturnType<typeof vi.fn>;
  createCategory: ReturnType<typeof vi.fn>;
}

/** Keeps the created category in the list it hands back, in name order like the backend. */
function stubCategoriesApi(categories: Category[] = [category()]): StubCategoriesApi {
  let stored = [...categories];
  let nextId = Math.max(0, ...stored.map((candidate) => candidate.id)) + 1;

  return {
    listCategories: vi.fn(() => Promise.resolve([...stored])),
    createCategory: vi.fn((input: { name: string; color: string; icon: string }) => {
      const created = category({ ...input, id: nextId++ });
      stored = [...stored, created].sort((a, b) => a.name.localeCompare(b.name));
      return Promise.resolve(created);
    }),
  };
}

async function createAccount(
  entriesApi: StubEntriesApi,
  categoriesApi: StubCategoriesApi = stubCategoriesApi(),
): Promise<ComponentFixture<Account>> {
  await TestBed.configureTestingModule({
    imports: [Account],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ id: '1' })),
          snapshot: { paramMap: convertToParamMap({ id: '1' }) },
        },
      },
      {
        provide: AccountsApi,
        useValue: {
          listActiveAccounts: vi
            .fn()
            .mockResolvedValue([accountFixture({ id: 1, name: 'Compte Courant' })]),
          listArchivedAccounts: vi.fn().mockResolvedValue([]),
        },
      },
      { provide: CategoriesApi, useValue: categoriesApi },
      { provide: EntriesApi, useValue: entriesApi },
      {
        provide: DisplaySettingsService,
        useValue: { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER') },
      },
    ],
  }).compileComponents();

  await TestBed.inject(AccountsStore).loaded;

  const fixture = TestBed.createComponent(Account);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<Account>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

function rows(fixture: ComponentFixture<Account>): HTMLElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="entry-row"]'),
  );
}

function one(fixture: ComponentFixture<Account>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

function textIn(row: HTMLElement, testId: string): string {
  return row.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';
}

async function click(fixture: ComponentFixture<Account>, testId: string): Promise<void> {
  (one(fixture, testId) as HTMLButtonElement).click();
  await settle(fixture);
}

async function setDate(
  fixture: ComponentFixture<Account>,
  testId: string,
  value: string,
): Promise<void> {
  const input = one(fixture, testId) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
}

async function type(
  fixture: ComponentFixture<Account>,
  testId: string,
  value: string,
): Promise<void> {
  const input = one(fixture, testId) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
}

async function select(
  fixture: ComponentFixture<Account>,
  testId: string,
  value: string,
): Promise<void> {
  const element = one(fixture, testId) as HTMLSelectElement;
  element.value = value;
  element.dispatchEvent(new Event('change'));
  await settle(fixture);
}

/** The `listEntries` query of the nth call, newest last. */
function queryOf(entriesApi: StubEntriesApi, index = -1): ListEntriesQuery {
  const calls = entriesApi.listEntries.mock.calls;
  return (calls.at(index) as [number, ListEntriesQuery])[1];
}

/**
 * A page's worth and then some, dated backwards day by day from
 * `2026-03-01` — enough for `has_more` to be true on the first request.
 */
function manyEntries(count: number): Entry[] {
  return Array.from({ length: count }, (_unused, index) => {
    const date = new Date(2026, 2, 1 - index);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return entry({
      id: index + 1,
      label: `Écriture ${index + 1}`,
      date: `${date.getFullYear()}-${month}-${day}`,
    });
  });
}

describe('Account', () => {
  it('renders a page of entries, most-recent-first by default', async () => {
    const entriesApi = stubEntriesApi([
      entry({ id: 1, label: 'Ancienne', date: '2026-02-01' }),
      entry({ id: 2, label: 'Récente', date: '2026-02-20' }),
    ]);

    const fixture = await createAccount(entriesApi);

    expect(queryOf(entriesApi, 0)).toMatchObject({ sort: 'DESC', offset: 0, from: null, to: null });
    expect(rows(fixture).map((row) => textIn(row, 'entry-label'))).toEqual(['Récente', 'Ancienne']);
  });

  it('renders each entry through the display-settings date and currency pipes', async () => {
    const fixture = await createAccount(
      stubEntriesApi([entry({ date: '2026-02-01', amount: -25.5 })]),
    );

    const [row] = rows(fixture);
    expect(textIn(row, 'entry-date')).toBe('01/02/2026');
    expect(textIn(row, 'entry-amount')).toContain('€');
    expect(textIn(row, 'entry-amount')).toContain('25,50');
  });

  it('renders the system entry with no delete or edit affordance', async () => {
    const fixture = await createAccount(
      stubEntriesApi([
        entry({ id: 1, is_system: true, date: '2026-01-01', amount: 500 }),
        entry({ id: 2, date: '2026-02-01' }),
      ]),
    );

    const [normal, system] = rows(fixture);
    expect(system.dataset['system']).toBe('true');
    expect(system.querySelector('[data-testid="entry-locked"]')).not.toBeNull();
    expect(system.querySelector('[data-testid="entry-reconciled"]')).toBeNull();
    expect(normal.querySelector('[data-testid="entry-locked"]')).toBeNull();
  });

  it('shows the account name, icon and balance in its header', async () => {
    const fixture = await createAccount(stubEntriesApi([entry()]));

    expect(one(fixture, 'account-name')?.textContent?.trim()).toBe('Compte Courant');
    expect(one(fixture, 'account-icon')).not.toBeNull();
    expect(one(fixture, 'account-balance')?.textContent).toContain('234,56');
  });

  it('re-requests oldest-first when the reverse-order control is used', async () => {
    const entriesApi = stubEntriesApi([
      entry({ id: 1, label: 'Ancienne', date: '2026-02-01' }),
      entry({ id: 2, label: 'Récente', date: '2026-02-20' }),
    ]);
    const fixture = await createAccount(entriesApi);

    await click(fixture, 'entries-sort-toggle');

    expect(queryOf(entriesApi)).toMatchObject({ sort: 'ASC', offset: 0 });
    expect(rows(fixture).map((row) => textIn(row, 'entry-label'))).toEqual(['Ancienne', 'Récente']);
  });

  it('re-requests within the date range the filter is set to', async () => {
    const entriesApi = stubEntriesApi([
      entry({ id: 1, label: 'Avant', date: '2026-01-10' }),
      entry({ id: 2, label: 'Dedans', date: '2026-02-10' }),
    ]);
    const fixture = await createAccount(entriesApi);

    await setDate(fixture, 'entries-from', '2026-02-01');
    await setDate(fixture, 'entries-to', '2026-02-28');

    expect(queryOf(entriesApi)).toMatchObject({ from: '2026-02-01', to: '2026-02-28', offset: 0 });
    expect(rows(fixture).map((row) => textIn(row, 'entry-label'))).toEqual(['Dedans']);
  });

  it('clears both bounds when the filters are reset', async () => {
    const entriesApi = stubEntriesApi([entry()]);
    const fixture = await createAccount(entriesApi);

    await setDate(fixture, 'entries-from', '2026-02-01');
    await click(fixture, 'entries-reset-filters');

    expect(queryOf(entriesApi)).toMatchObject({ from: null, to: null });
  });

  it('shows the empty-state copy when nothing matches the filters', async () => {
    const fixture = await createAccount(stubEntriesApi([]));

    expect(one(fixture, 'entries-empty')?.textContent).toContain(
      'Aucune écriture ne correspond aux filtres actuels.',
    );
  });

  it('appends the next page as the list is scrolled towards its end', async () => {
    const entriesApi = stubEntriesApi(manyEntries(60));
    const fixture = await createAccount(entriesApi);

    expect(entriesApi.listEntries).toHaveBeenCalledTimes(1);

    await scrollToIndex(fixture, 40);

    expect(queryOf(entriesApi)).toMatchObject({ offset: 50 });
  });

  it('jumps to the first entry at or before the target date', async () => {
    const entriesApi = stubEntriesApi(manyEntries(60));
    const fixture = await createAccount(entriesApi);
    // jsdom gives the viewport no layout, so the real scroll would throw.
    const scrollSpy = vi
      .spyOn(viewportOf(fixture), 'scrollToIndex')
      .mockImplementation(() => undefined);

    await setDate(fixture, 'entries-jump-date', '2026-01-05');
    await click(fixture, 'entries-jump');

    // Most-recent-first from 2026-03-01, one entry per day: 2026-01-05 is 55
    // days back, past the first page — so the next one is fetched, then
    // scrolled to.
    expect(queryOf(entriesApi)).toMatchObject({ offset: 50 });
    expect(scrollSpy).toHaveBeenCalledWith(55, 'smooth');
  });

  it('creates an entry from the top row and reloads the list', async () => {
    const entriesApi = stubEntriesApi([entry()]);
    const fixture = await createAccount(entriesApi);

    await click(fixture, 'entries-new');
    await type(fixture, 'entry-form-label', 'Boulangerie');
    await type(fixture, 'entry-form-amount', '-12.40');
    await setDate(fixture, 'entry-form-date', '2026-03-05');
    await select(fixture, 'entry-form-category', '1');
    await click(fixture, 'entry-save');

    expect(entriesApi.createEntry).toHaveBeenCalledWith(1, {
      label: 'Boulangerie',
      category_id: 1,
      date: '2026-03-05',
      amount: -12.4,
      description: '',
    });
    expect(queryOf(entriesApi)).toMatchObject({ offset: 0 });
    expect(one(fixture, 'entry-new-row')).toBeNull();
  });

  it('marks a freshly created entry reconciled through set_reconciled', async () => {
    const entriesApi = stubEntriesApi([entry()]);
    const fixture = await createAccount(entriesApi);

    await click(fixture, 'entries-new');
    await type(fixture, 'entry-form-label', 'Boulangerie');
    await type(fixture, 'entry-form-amount', '-12.40');
    await click(fixture, 'entry-form-reconciled');
    await click(fixture, 'entry-save');

    expect(entriesApi.setReconciled).toHaveBeenCalledWith(999, true);
  });

  it('refuses to save an amount that is not a number, and says so inline', async () => {
    const entriesApi = stubEntriesApi([entry()]);
    const fixture = await createAccount(entriesApi);

    await click(fixture, 'entries-new');
    await type(fixture, 'entry-form-label', 'Sans montant');
    await type(fixture, 'entry-form-amount', '-');
    await click(fixture, 'entry-save');

    expect(entriesApi.createEntry).not.toHaveBeenCalled();
    // A toast as well (spec 06), but the inline error is what names the field.
    expect(one(fixture, 'entry-form-amount-error')).not.toBeNull();

    await type(fixture, 'entry-form-amount', '-12.40');

    expect(one(fixture, 'entry-form-amount-error')).toBeNull();
  });

  it('leaves the amount error alone until a save has been attempted', async () => {
    const fixture = await createAccount(stubEntriesApi([entry()]));

    await click(fixture, 'entries-new');

    // The creation row opens on a lone sign, which isn't a number yet.
    expect(one(fixture, 'entry-form-amount-error')).toBeNull();
  });

  it('blocks saving while the label is empty, inline rather than as a toast', async () => {
    const entriesApi = stubEntriesApi([entry()]);
    const fixture = await createAccount(entriesApi);

    await click(fixture, 'entries-new');
    await click(fixture, 'entry-save');

    expect(entriesApi.createEntry).not.toHaveBeenCalled();
    expect(one(fixture, 'entry-form-label-error')).not.toBeNull();
  });

  it('edits an existing row in place and saves it', async () => {
    const entriesApi = stubEntriesApi([entry({ id: 7, label: 'Courses', amount: -25.5 })]);
    const fixture = await createAccount(entriesApi);

    rows(fixture)[0].click();
    await settle(fixture);
    await type(fixture, 'entry-form-label', 'Courses du samedi');
    await click(fixture, 'entry-save');

    expect(entriesApi.updateEntry).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ label: 'Courses du samedi', amount: -25.5 }),
    );
  });

  it('leaves the system entry read-only when its row is clicked', async () => {
    const entriesApi = stubEntriesApi([entry({ id: 1, is_system: true })]);
    const fixture = await createAccount(entriesApi);

    rows(fixture)[0].click();
    await settle(fixture);

    expect(one(fixture, 'entry-form-label')).toBeNull();
    expect(rows(fixture)[0].querySelector('[data-testid="entry-delete"]')).toBeNull();
  });

  it('deletes an entry only once the confirmation is accepted', async () => {
    const entriesApi = stubEntriesApi([entry({ id: 7 })]);
    const fixture = await createAccount(entriesApi);

    await click(fixture, 'entry-delete');
    expect(entriesApi.deleteEntry).not.toHaveBeenCalled();

    await click(fixture, 'confirm-accept');

    expect(entriesApi.deleteEntry).toHaveBeenCalledWith(7);
    expect(queryOf(entriesApi)).toMatchObject({ offset: 0 });
  });

  it('toggles a row’s reconciled flag without reloading the list', async () => {
    const entriesApi = stubEntriesApi([entry({ id: 7, reconciled: false })]);
    const fixture = await createAccount(entriesApi);

    await click(fixture, 'entry-reconciled');

    expect(entriesApi.setReconciled).toHaveBeenCalledWith(7, true);
    expect(entriesApi.listEntries).toHaveBeenCalledTimes(1);
    expect(one(fixture, 'entry-reconciled')?.dataset['reconciled']).toBe('true');
  });

  it('opens the category modal from the select’s quick-create option', async () => {
    const fixture = await createAccount(stubEntriesApi([entry()]));

    await click(fixture, 'entries-new');
    await select(fixture, 'entry-form-category', '__new__');

    expect(one(fixture, 'category-name')).not.toBeNull();
    // The trigger option isn't a value: the field stays on what it showed.
    expect((one(fixture, 'entry-form-category') as HTMLSelectElement).value).toBe('');
  });

  it('selects the quick-created category on the row without reopening the dropdown', async () => {
    const categoriesApi = stubCategoriesApi([category({ id: 1, name: 'Alimentation' })]);
    const entriesApi = stubEntriesApi([entry()]);
    const fixture = await createAccount(entriesApi, categoriesApi);

    await click(fixture, 'entries-new');
    await select(fixture, 'entry-form-category', '__new__');
    await type(fixture, 'category-name', 'Cadeaux');
    await click(fixture, 'icon-option');
    await click(fixture, 'category-save');

    expect(categoriesApi.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Cadeaux' }),
    );
    expect(one(fixture, 'category-name')).toBeNull();

    const field = one(fixture, 'entry-form-category') as HTMLSelectElement;
    expect(field.value).toBe('2');
    expect(Array.from(field.options).map((option) => option.textContent?.trim())).toContain(
      'Cadeaux',
    );

    await type(fixture, 'entry-form-label', 'Anniversaire');
    await type(fixture, 'entry-form-amount', '-20');
    await click(fixture, 'entry-save');

    expect(entriesApi.createEntry).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        category_id: 2,
      }),
    );
  });

  it('leaves the category unchanged when the quick-create modal is cancelled', async () => {
    const fixture = await createAccount(stubEntriesApi([entry()]));

    await click(fixture, 'entries-new');
    await select(fixture, 'entry-form-category', '1');
    await select(fixture, 'entry-form-category', '__new__');
    await click(fixture, 'category-cancel');

    expect(one(fixture, 'category-name')).toBeNull();
    expect((one(fixture, 'entry-form-category') as HTMLSelectElement).value).toBe('1');
  });

  it('flips the type selector with the amount’s sign, in both directions', async () => {
    const fixture = await createAccount(stubEntriesApi([entry()]));

    await click(fixture, 'entries-new');
    await type(fixture, 'entry-form-amount', '30');
    expect(one(fixture, 'entry-form-credit')?.dataset['selected']).toBe('true');

    await type(fixture, 'entry-form-amount', '-30');
    expect(one(fixture, 'entry-form-debit')?.dataset['selected']).toBe('true');

    await click(fixture, 'entry-form-credit');
    expect((one(fixture, 'entry-form-amount') as HTMLInputElement).value).toBe('30');
    expect(one(fixture, 'entry-form-credit')?.dataset['selected']).toBe('true');
  });
});

function viewportOf(fixture: ComponentFixture<Account>): CdkVirtualScrollViewport {
  return fixture.debugElement
    .query((node) => node.name === 'cdk-virtual-scroll-viewport')
    .injector.get(CdkVirtualScrollViewport);
}

/**
 * The viewport has no layout in jsdom, so scrolling is simulated by handing
 * the component the index the viewport would have reported.
 */
async function scrollToIndex(fixture: ComponentFixture<Account>, index: number): Promise<void> {
  (
    fixture.componentInstance as unknown as { onScrolledIndex(index: number): void }
  ).onScrolledIndex(index);
  await settle(fixture);
}
