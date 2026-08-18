import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideBrnCalendarI18n } from '@spartan-ng/brain/calendar';
import { provideNativeDateAdapter } from '@spartan-ng/brain/date-time';
import { toast } from '@spartan-ng/brain/sonner';

import { AccountsApi } from '@data/accounts/accounts-api';
import { AccountsStore } from '@data/accounts/accounts-store';
import { CategoriesApi, Category } from '@data/categories/categories-api';
import { FRENCH_CALENDAR_I18N } from '@core/display-settings/calendar-i18n';
import { DisplaySettingsService } from '@core/display-settings/display-settings';
import { EntriesApi, Entry, ListEntriesQuery } from '@data/entries/entries-api';
import { ReconciliationApi, ReconciliationSummary } from '@data/reconciliation/reconciliation-api';
import { RecurringRulesApi } from '@data/recurring-rules/recurring-rules-api';
import { accountFixture } from '@core/testing/account.fixture';
import '@core/testing/jsdom-polyfills';
import { Account } from './account';

// Spied rather than mocked: the rest of the module is what this screen's
// dialogs and pickers are built on, so it has to stay real.
beforeEach(() => {
  vi.spyOn(toast, 'error').mockReturnValue('');
  vi.spyOn(toast, 'info').mockReturnValue('');
});

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
  /** Mutated by `setReconciled`, so a filtered reload sees the new state. */
  const stored = entries.map((candidate) => ({ ...candidate }));

  return {
    createEntry: vi.fn().mockResolvedValue(entry({ id: 999 })),
    updateEntry: vi.fn().mockResolvedValue(entry()),
    deleteEntry: vi.fn().mockResolvedValue(undefined),
    setReconciled: vi.fn((id: number, reconciled: boolean) => {
      const target = stored.find((candidate) => candidate.id === id);
      if (target) {
        target.reconciled = reconciled;
      }
      return Promise.resolve(entry({ ...target, reconciled }));
    }),
    listEntries: vi.fn((_accountId: number, query: ListEntriesQuery) => {
      const matching = stored
        .filter(
          (candidate) =>
            candidate.is_system ||
            ((query.from === null || candidate.date >= query.from) &&
              (query.to === null || candidate.date <= query.to) &&
              (!query.unreconciled_only || !candidate.reconciled)),
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

interface StubReconciliationApi {
  summary: ReturnType<typeof vi.fn>;
  setBankBalance: ReturnType<typeof vi.fn>;
  setStatementDate: ReturnType<typeof vi.fn>;
  /** What the next call resolves with — the panel's figures after an edit. */
  next(overrides: Partial<ReconciliationSummary>): void;
}

/**
 * Answers every command with one stored summary, as the backend does — the
 * three commands all return the freshly recomputed shape.
 */
function stubReconciliationApi(
  initial: Partial<ReconciliationSummary> = {},
): StubReconciliationApi {
  let current: ReconciliationSummary = {
    statement_date: '2026-02-28',
    bank_balance: 1000,
    reconciled_balance: 984.5,
    delta: 15.5,
    is_balanced: false,
    unreconciled_count: 4,
    ...initial,
  };
  const answer = (): Promise<ReconciliationSummary> => Promise.resolve({ ...current });

  return {
    summary: vi.fn(answer),
    setBankBalance: vi.fn(answer),
    setStatementDate: vi.fn(answer),
    next(overrides: Partial<ReconciliationSummary>): void {
      current = { ...current, ...overrides };
    },
  };
}

interface StubRecurringRulesApi {
  openAccount: ReturnType<typeof vi.fn>;
  generateAllDue: ReturnType<typeof vi.fn>;
  listRecurringRules: ReturnType<typeof vi.fn>;
  createRecurringRule: ReturnType<typeof vi.fn>;
  updateRecurringRule: ReturnType<typeof vi.fn>;
  deleteRecurringRule: ReturnType<typeof vi.fn>;
}

/**
 * Generation is a no-op by default and the account owns no rules, so the
 * tests about the register stay about it — `RecurringRulesModal`'s own spec
 * covers what the rules surface does.
 */
function stubRecurringRulesApi(openAccount = vi.fn().mockResolvedValue(0)): StubRecurringRulesApi {
  return {
    openAccount,
    generateAllDue: vi.fn().mockResolvedValue(undefined),
    listRecurringRules: vi.fn().mockResolvedValue([]),
    createRecurringRule: vi.fn(),
    updateRecurringRule: vi.fn(),
    deleteRecurringRule: vi.fn().mockResolvedValue(undefined),
  };
}

async function createAccount(
  entriesApi: StubEntriesApi,
  categoriesApi: StubCategoriesApi = stubCategoriesApi(),
  reconciliationApi: StubReconciliationApi = stubReconciliationApi(),
  recurringRulesApi: StubRecurringRulesApi = stubRecurringRulesApi(),
): Promise<ComponentFixture<Account>> {
  await TestBed.configureTestingModule({
    imports: [Account],
    providers: [
      provideRouter([]),
      provideNativeDateAdapter(),
      provideBrnCalendarI18n(FRENCH_CALENDAR_I18N),
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
      { provide: ReconciliationApi, useValue: reconciliationApi },
      { provide: RecurringRulesApi, useValue: recurringRulesApi },
      {
        provide: DisplaySettingsService,
        useValue: { dateFormat: signal('DMY'), currencyFormat: signal('SYMBOL_AFTER') },
      },
    ],
  }).compileComponents();

  await TestBed.inject(AccountsStore).loaded;

  const fixture = TestBed.createComponent(Account);
  fixture.componentRef.setInput('accountId', 1);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

/**
 * Repeated, because a load is several chained awaits deep — the screen
 * generates the account's due occurrences before it reads the register, and
 * one round of stability only drains as far as the next link in the chain.
 */
async function settle(fixture: ComponentFixture<Account>): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await fixture.whenStable();
  }
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

/**
 * `hlm-date-picker-input` renders its actual `<input>` inside its own
 * template, keyed by `inputId` rather than a `data-testid` this file's `one`
 * could reach — so date fields are found by that id instead. Every picker in
 * this screen sets `inputId` to the same string as its `data-testid`.
 */
function dateInput(fixture: ComponentFixture<Account>, id: string): HTMLInputElement {
  return (fixture.nativeElement as HTMLElement).querySelector(`#${id}`) as HTMLInputElement;
}

/** Types into a date-picker field and commits it — those fields only parse on blur/Enter. */
async function setEntryDate(fixture: ComponentFixture<Account>, value: string): Promise<void> {
  await setDate(fixture, 'entry-form-date', value);
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
  id: string,
  value: string,
): Promise<void> {
  const input = dateInput(fixture, id);
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input'));
  // A real `.blur()` (not a synthetic dispatched event) actually clears
  // `document.activeElement` — otherwise a later `.focus()` on a different
  // field fires a second, real blur here, re-parsing this field's
  // already-reformatted display text with the ISO-only parser and clearing it.
  input.blur();
  await settle(fixture);
}

/** Types into a plain field and commits it, as leaving the field does. */
async function commit(
  fixture: ComponentFixture<Account>,
  testId: string,
  value: string,
): Promise<void> {
  const input = one(fixture, testId) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
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

/**
 * `hlm-select`'s dropdown is a `hlm-select-item` list portaled to
 * `document.body` — reachable by `data-testid`, but only while open — rather
 * than a native `<select>`'s options. Opens the trigger, clicks the item,
 * and lets the (default) auto-close on select settle.
 */
async function selectCategory(
  fixture: ComponentFixture<Account>,
  itemTestId: string,
): Promise<void> {
  one(fixture, 'entry-form-category')?.querySelector('button')?.click();
  await settle(fixture);
  (document.querySelector(`[data-testid="${itemTestId}"]`) as HTMLElement).click();
  await settle(fixture);
}

/** The category options currently rendered in the (opened) dropdown, by their visible text. */
async function categoryOptionLabels(fixture: ComponentFixture<Account>): Promise<string[]> {
  const trigger = one(fixture, 'entry-form-category')?.querySelector('button');
  trigger?.click();
  await settle(fixture);
  const labels = Array.from(document.querySelectorAll('[data-slot="select-item"]')).map(
    (item) => item.textContent?.trim() ?? '',
  );
  trigger?.click();
  await settle(fixture);
  return labels;
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
  it('generates the account’s due occurrences before its first read of the register', async () => {
    const order: string[] = [];
    const entriesApi = stubEntriesApi([entry()]);
    entriesApi.listEntries.mockImplementation(() => {
      order.push('listEntries');
      return Promise.resolve({ entries: [], has_more: false });
    });
    const recurringRulesApi = stubRecurringRulesApi(
      vi.fn(() => {
        order.push('openAccount');
        return Promise.resolve(0);
      }),
    );

    await createAccount(
      entriesApi,
      stubCategoriesApi(),
      stubReconciliationApi(),
      recurringRulesApi,
    );

    expect(recurringRulesApi.openAccount).toHaveBeenCalledWith(1);
    expect(order[0]).toBe('openAccount');
  });

  it('reports a non-zero generated count as an informational toast', async () => {
    await createAccount(
      stubEntriesApi([entry()]),
      stubCategoriesApi(),
      stubReconciliationApi(),
      stubRecurringRulesApi(vi.fn().mockResolvedValue(3)),
    );

    expect(toast.info).toHaveBeenCalledWith('3 écritures générées');
  });

  it('says nothing when generation produced no entry', async () => {
    vi.mocked(toast.info).mockClear();

    await createAccount(stubEntriesApi([entry()]));

    expect(toast.info).not.toHaveBeenCalled();
  });

  it('still renders the register when generation rejects, toasting the failure', async () => {
    const fixture = await createAccount(
      stubEntriesApi([entry({ label: 'Courses' })]),
      stubCategoriesApi(),
      stubReconciliationApi(),
      stubRecurringRulesApi(vi.fn().mockRejectedValue({ kind: 'Io', message: 'disque plein' })),
    );

    expect(toast.error).toHaveBeenCalledWith('disque plein');
    expect(rows(fixture).map((row) => textIn(row, 'entry-label'))).toEqual(['Courses']);
  });

  it('generates once per account, not again on every filter change', async () => {
    const recurringRulesApi = stubRecurringRulesApi();
    const fixture = await createAccount(
      stubEntriesApi([entry()]),
      stubCategoriesApi(),
      stubReconciliationApi(),
      recurringRulesApi,
    );

    await click(fixture, 'entries-sort-toggle');
    await settle(fixture);

    expect(recurringRulesApi.openAccount).toHaveBeenCalledTimes(1);
  });

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

    // Typed per the display-settings format (DMY here), not the ISO the model stores.
    await setDate(fixture, 'entries-from', '01/02/2026');
    await setDate(fixture, 'entries-to', '28/02/2026');

    expect(queryOf(entriesApi)).toMatchObject({ from: '2026-02-01', to: '2026-02-28', offset: 0 });
    expect(rows(fixture).map((row) => textIn(row, 'entry-label'))).toEqual(['Dedans']);
  });

  it('clears both bounds when the filters are reset', async () => {
    const entriesApi = stubEntriesApi([entry()]);
    const fixture = await createAccount(entriesApi);

    await setDate(fixture, 'entries-from', '01/02/2026');
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

    await setDate(fixture, 'entries-jump-date', '05/01/2026');
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
    await setEntryDate(fixture, '05/03/2026');
    await selectCategory(fixture, 'entry-form-category-option-1');
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

  it('opens an existing row on its amount in fr-FR notation, comma included', async () => {
    const entriesApi = stubEntriesApi([entry({ id: 7, amount: -25.5 })]);
    const fixture = await createAccount(entriesApi);

    rows(fixture)[0].click();
    await settle(fixture);

    // Not "-25.5": the field's own dot would read back as a different amount
    // to the French-notation typing it otherwise accepts.
    expect((one(fixture, 'entry-form-amount') as HTMLInputElement).value).toBe('-25,5');
  });

  it('opens the form focused on the column the click landed in', async () => {
    const entriesApi = stubEntriesApi([entry({ id: 7, label: 'Courses', amount: -25.5 })]);
    const fixture = await createAccount(entriesApi);

    const amount = rows(fixture)[0].querySelector('[data-testid="entry-amount"]') as HTMLElement;
    amount.click();
    await settle(fixture);

    expect(document.activeElement).toBe(one(fixture, 'entry-form-amount'));
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
    await selectCategory(fixture, 'entry-form-category-new');

    expect(one(fixture, 'category-name')).not.toBeNull();
    // The trigger option isn't a value: the field stays on what it showed.
    expect(one(fixture, 'entry-form-category')?.textContent?.trim()).toBe('Aucun poste');
  });

  it('selects the quick-created category on the row without reopening the dropdown', async () => {
    const categoriesApi = stubCategoriesApi([category({ id: 1, name: 'Alimentation' })]);
    const entriesApi = stubEntriesApi([entry()]);
    const fixture = await createAccount(entriesApi, categoriesApi);

    await click(fixture, 'entries-new');
    await selectCategory(fixture, 'entry-form-category-new');
    await type(fixture, 'category-name', 'Cadeaux');
    await click(fixture, 'icon-option');
    await click(fixture, 'category-save');

    expect(categoriesApi.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Cadeaux' }),
    );
    expect(one(fixture, 'category-name')).toBeNull();

    expect(one(fixture, 'entry-form-category')?.textContent?.trim()).toBe('Cadeaux');
    expect(await categoryOptionLabels(fixture)).toContain('Cadeaux');

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
    await selectCategory(fixture, 'entry-form-category-option-1');
    await selectCategory(fixture, 'entry-form-category-new');
    await click(fixture, 'category-cancel');

    expect(one(fixture, 'category-name')).toBeNull();
    expect(one(fixture, 'entry-form-category')?.textContent?.trim()).toBe('Alimentation');
  });

  it('opens the account with the reconciliation panel collapsed and the filter off', async () => {
    const entriesApi = stubEntriesApi([entry()]);
    const reconciliationApi = stubReconciliationApi();
    const fixture = await createAccount(entriesApi, stubCategoriesApi(), reconciliationApi);

    expect(one(fixture, 'reconciliation-toggle')).not.toBeNull();
    expect(one(fixture, 'reconciliation-panel')).toBeNull();
    expect(reconciliationApi.summary).not.toHaveBeenCalled();
    expect(queryOf(entriesApi, 0)).toMatchObject({ unreconciled_only: false });
  });

  it('opens the panel on the Pointage toggle and asks for the summary', async () => {
    const reconciliationApi = stubReconciliationApi();
    const fixture = await createAccount(stubEntriesApi([entry()]), undefined, reconciliationApi);

    await click(fixture, 'reconciliation-toggle');

    expect(reconciliationApi.summary).toHaveBeenCalledWith(1);
    expect(one(fixture, 'reconciliation-panel')).not.toBeNull();
    expect(one(fixture, 'reconciliation-delta')?.textContent).toContain('15,50');
  });

  it('ticks the unreconciled filter when the panel opens, and re-requests with it', async () => {
    const entriesApi = stubEntriesApi([
      entry({ id: 1, label: 'Pointée', reconciled: true }),
      entry({ id: 2, label: 'À pointer', reconciled: false }),
    ]);
    const fixture = await createAccount(entriesApi);

    await click(fixture, 'reconciliation-toggle');

    expect(queryOf(entriesApi)).toMatchObject({ unreconciled_only: true, offset: 0 });
    expect(one(fixture, 'reconciliation-filter')?.dataset['checked']).toBe('true');
    expect(rows(fixture).map((row) => textIn(row, 'entry-label'))).toEqual(['À pointer']);
  });

  it('re-requests the full list when the filter is unticked with the panel still open', async () => {
    const entriesApi = stubEntriesApi([
      entry({ id: 1, label: 'Pointée', reconciled: true }),
      entry({ id: 2, label: 'À pointer', reconciled: false }),
    ]);
    const fixture = await createAccount(entriesApi);

    await click(fixture, 'reconciliation-toggle');
    await click(fixture, 'reconciliation-filter');

    expect(queryOf(entriesApi)).toMatchObject({ unreconciled_only: false });
    expect(rows(fixture).map((row) => textIn(row, 'entry-label'))).toEqual([
      'À pointer',
      'Pointée',
    ]);
  });

  it('restores the full list when the panel collapses, even with the box still ticked', async () => {
    const entriesApi = stubEntriesApi([
      entry({ id: 1, label: 'Pointée', reconciled: true }),
      entry({ id: 2, label: 'À pointer', reconciled: false }),
    ]);
    const fixture = await createAccount(entriesApi);

    await click(fixture, 'reconciliation-toggle');
    expect(queryOf(entriesApi)).toMatchObject({ unreconciled_only: true });

    await click(fixture, 'reconciliation-toggle');

    // The checkbox was never unticked — collapsing alone is what disarms it.
    expect(queryOf(entriesApi)).toMatchObject({ unreconciled_only: false });
    expect(rows(fixture).map((row) => textIn(row, 'entry-label'))).toEqual([
      'À pointer',
      'Pointée',
    ]);
  });

  it('reloads the page when a row is ticked while the filter is active', async () => {
    const entriesApi = stubEntriesApi([entry({ id: 7, label: 'À pointer', reconciled: false })]);
    const reconciliationApi = stubReconciliationApi();
    const fixture = await createAccount(entriesApi, undefined, reconciliationApi);

    await click(fixture, 'reconciliation-toggle');
    const listCalls = entriesApi.listEntries.mock.calls.length;

    await click(fixture, 'entry-reconciled');

    expect(entriesApi.setReconciled).toHaveBeenCalledWith(7, true);
    expect(entriesApi.listEntries.mock.calls.length).toBe(listCalls + 1);
    // The row stopped matching the predicate the list claims to obey.
    expect(rows(fixture)).toHaveLength(0);
    expect(reconciliationApi.summary).toHaveBeenCalledTimes(2);
  });

  it('keeps the in-place patch when a row is ticked with the filter off', async () => {
    const entriesApi = stubEntriesApi([entry({ id: 7, reconciled: false })]);
    const reconciliationApi = stubReconciliationApi();
    const fixture = await createAccount(entriesApi, undefined, reconciliationApi);

    await click(fixture, 'reconciliation-toggle');
    await click(fixture, 'reconciliation-filter');
    const listCalls = entriesApi.listEntries.mock.calls.length;

    await click(fixture, 'entry-reconciled');

    expect(entriesApi.listEntries.mock.calls.length).toBe(listCalls);
    expect(one(fixture, 'entry-reconciled')?.dataset['reconciled']).toBe('true');
    expect(reconciliationApi.summary).toHaveBeenCalledTimes(2);
  });

  it('stores an edited bank balance and shows the figures it comes back with', async () => {
    const reconciliationApi = stubReconciliationApi();
    const fixture = await createAccount(stubEntriesApi([entry()]), undefined, reconciliationApi);

    await click(fixture, 'reconciliation-toggle');
    reconciliationApi.next({ bank_balance: 984.5, delta: 0, is_balanced: true });
    await commit(fixture, 'reconciliation-bank-balance', '984,50');

    expect(reconciliationApi.setBankBalance).toHaveBeenCalledWith(1, 984.5);
    expect(one(fixture, 'reconciliation-delta')?.textContent?.trim()).toBe('0,00 €');
    expect(one(fixture, 'reconciliation-verdict')?.textContent).toContain('Comptes pointés');
  });

  it('stores an edited statement date and shows the figures it comes back with', async () => {
    const reconciliationApi = stubReconciliationApi({
      statement_date: null,
      reconciled_balance: null,
      delta: null,
      is_balanced: false,
    });
    const fixture = await createAccount(stubEntriesApi([entry()]), undefined, reconciliationApi);

    await click(fixture, 'reconciliation-toggle');
    expect(one(fixture, 'reconciliation-statement-date-prompt')).not.toBeNull();

    reconciliationApi.next({
      statement_date: '2026-03-31',
      reconciled_balance: 984.5,
      delta: 15.5,
    });
    await setDate(fixture, 'reconciliation-statement-date', '31/03/2026');

    expect(reconciliationApi.setStatementDate).toHaveBeenCalledWith(1, '2026-03-31');
    expect(one(fixture, 'reconciliation-statement-date-prompt')).toBeNull();
    expect(one(fixture, 'reconciliation-reconciled-balance')?.textContent).toContain('984,50');
  });

  it('flips the type selector with the amount’s sign, in both directions', async () => {
    const fixture = await createAccount(stubEntriesApi([entry()]));

    await click(fixture, 'entries-new');
    // The creation row opens on an empty field, which reads as non-negative
    // and so shows crédit selected until a sign says otherwise.
    expect((one(fixture, 'entry-form-amount') as HTMLInputElement).value).toBe('');
    expect(one(fixture, 'entry-form-credit')?.dataset['selected']).toBe('true');

    await type(fixture, 'entry-form-amount', '-30');
    expect(one(fixture, 'entry-form-debit')?.dataset['selected']).toBe('true');

    await click(fixture, 'entry-form-credit');
    expect((one(fixture, 'entry-form-amount') as HTMLInputElement).value).toBe('30');
    expect(one(fixture, 'entry-form-credit')?.dataset['selected']).toBe('true');

    await type(fixture, 'entry-form-amount', '-30');
    expect(one(fixture, 'entry-form-debit')?.dataset['selected']).toBe('true');
  });

  describe('recurring rules', () => {
    it('opens the rules modal from the toolbar, on this account', async () => {
      const recurringRulesApi = stubRecurringRulesApi();
      const fixture = await createAccount(
        stubEntriesApi([entry()]),
        stubCategoriesApi(),
        stubReconciliationApi(),
        recurringRulesApi,
      );

      await click(fixture, 'recurring-open');

      expect(one(fixture, 'recurring-modal')).not.toBeNull();
      expect(recurringRulesApi.listRecurringRules).toHaveBeenCalledWith(1);
    });

    it('closes the rules modal without leaving the register', async () => {
      const fixture = await createAccount(stubEntriesApi([entry()]));

      await click(fixture, 'recurring-open');
      await click(fixture, 'modal-backdrop');

      expect(one(fixture, 'recurring-modal')).toBeNull();
      expect(rows(fixture)).toHaveLength(1);
    });

    /**
     * A rule created in the modal backfills its missed occurrences, but only
     * the next generation run writes them. Without this the entries the user
     * just caused would sit unwritten until they navigated away and back.
     */
    it('regenerates and reloads the register once the rules modal closes', async () => {
      vi.mocked(toast.info).mockClear();
      const entriesApi = stubEntriesApi([entry()]);
      const recurringRulesApi = stubRecurringRulesApi(
        vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(2),
      );
      const fixture = await createAccount(
        entriesApi,
        stubCategoriesApi(),
        stubReconciliationApi(),
        recurringRulesApi,
      );
      entriesApi.listEntries.mockClear();

      await click(fixture, 'recurring-open');
      await click(fixture, 'modal-backdrop');
      await settle(fixture);

      expect(recurringRulesApi.openAccount).toHaveBeenCalledTimes(2);
      expect(entriesApi.listEntries).toHaveBeenCalled();
      expect(toast.info).toHaveBeenCalledWith('2 écritures générées');
    });
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
