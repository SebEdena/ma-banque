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

/** Pages, filters and sorts like the backend does, so the screen's requests round-trip honestly. */
function stubEntriesApi(entries: Entry[]): { listEntries: ReturnType<typeof vi.fn> } {
  return {
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

async function createAccount(
  entriesApi: { listEntries: ReturnType<typeof vi.fn> },
  categories: Category[] = [category()],
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
      {
        provide: CategoriesApi,
        useValue: { listCategories: vi.fn().mockResolvedValue(categories) },
      },
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

/** The `listEntries` query of the nth call, newest last. */
function queryOf(
  entriesApi: { listEntries: ReturnType<typeof vi.fn> },
  index = -1,
): ListEntriesQuery {
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
