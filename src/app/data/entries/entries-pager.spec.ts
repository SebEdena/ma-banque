import { TestBed } from '@angular/core/testing';

import { EntriesApi, Entry, EntryPage, ListEntriesQuery } from './entries-api';
import { EntriesPager, PageQuery } from './entries-pager';

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

const query: PageQuery = {
  accountId: 1,
  sort: 'DESC',
  from: null,
  to: null,
  unreconciledOnly: false,
};

function createPager(entriesApi: Partial<EntriesApi>): EntriesPager {
  TestBed.configureTestingModule({
    providers: [EntriesPager, { provide: EntriesApi, useValue: entriesApi }],
  });
  return TestBed.inject(EntriesPager);
}

describe('EntriesPager', () => {
  it('is not providable from the root injector — every account gets its own', () => {
    TestBed.configureTestingModule({ providers: [{ provide: EntriesApi, useValue: {} }] });
    expect(() => TestBed.inject(EntriesPager)).toThrow();
  });

  it('replaces the buffer on reload', async () => {
    const pager = createPager({
      listEntries: vi
        .fn()
        .mockResolvedValue({ entries: [entry({ id: 1 })], has_more: false } satisfies EntryPage),
    });

    await pager.reload(query);

    expect(pager.entries().map((e) => e.id)).toEqual([1]);
    expect(pager.hasMore()).toBe(false);
  });

  it('asks the backend for the unreconciled filter rather than filtering the buffer', async () => {
    const listEntries = vi.fn().mockResolvedValue({ entries: [entry()], has_more: false });
    const pager = createPager({ listEntries });

    await pager.reload({ ...query, unreconciledOnly: true });

    expect(listEntries).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ unreconciled_only: true }),
    );
  });

  it('appends the next page on loadMore, and does nothing once there is no more', async () => {
    const listEntries = vi.fn((_accountId: number, q: ListEntriesQuery): Promise<EntryPage> =>
      Promise.resolve({
        entries: [entry({ id: q.offset + 1 })],
        has_more: q.offset === 0,
      }),
    );
    const pager = createPager({ listEntries });

    await pager.reload(query);
    await pager.loadMore(query);
    await pager.loadMore(query);

    expect(pager.entries().map((e) => e.id)).toEqual([1, 2]);
    expect(listEntries).toHaveBeenCalledTimes(2);
  });

  it('discards a page that arrives after a newer reload has started', async () => {
    let resolveFirst!: (page: EntryPage) => void;
    const listEntries = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ entries: [entry({ id: 2 })], has_more: false });
    const pager = createPager({ listEntries });

    const first = pager.reload(query);
    await pager.reload({ ...query, sort: 'ASC' });
    resolveFirst({ entries: [entry({ id: 1 })], has_more: false });
    await first;

    expect(pager.entries().map((e) => e.id)).toEqual([2]);
  });

  it('jumps forward until the anchor date is buffered, and reports its index', async () => {
    const listEntries = vi.fn((_accountId: number, q: ListEntriesQuery): Promise<EntryPage> =>
      Promise.resolve({
        entries: [entry({ id: q.offset + 1, date: q.offset === 0 ? '2026-02-10' : '2026-01-05' })],
        has_more: q.offset === 0,
      }),
    );
    const pager = createPager({ listEntries });
    await pager.reload(query);

    const index = await pager.jumpTo(query, '2026-01-10');

    expect(index).toBe(1);
    expect(pager.entries().map((e) => e.id)).toEqual([1, 2]);
  });

  it('reports -1 once the buffer is exhausted without reaching the target', async () => {
    const pager = createPager({
      listEntries: vi
        .fn()
        .mockResolvedValue({ entries: [entry({ date: '2026-02-10' })], has_more: false }),
    });
    await pager.reload(query);

    expect(await pager.jumpTo(query, '2020-01-01')).toBe(-1);
  });

  it('patches the buffered row in place on setReconciled, without refetching', async () => {
    const listEntries = vi
      .fn()
      .mockResolvedValue({ entries: [entry({ id: 1, reconciled: false })], has_more: false });
    const setReconciled = vi.fn().mockResolvedValue(entry({ id: 1, reconciled: true }));
    const pager = createPager({ listEntries, setReconciled });
    await pager.reload(query);

    await pager.setReconciled(1, true);

    expect(pager.entries()[0].reconciled).toBe(true);
    expect(listEntries).toHaveBeenCalledTimes(1);
  });

  it('delegates create/update/delete to the API without reloading itself', async () => {
    const entriesApi = {
      createEntry: vi.fn().mockResolvedValue(entry({ id: 9 })),
      updateEntry: vi.fn().mockResolvedValue(entry({ id: 1 })),
      deleteEntry: vi.fn().mockResolvedValue(undefined),
      listEntries: vi.fn(),
    };
    const pager = createPager(entriesApi);

    await pager.createEntry(1, {
      label: 'Boulangerie',
      category_id: null,
      date: '2026-03-05',
      amount: -12.4,
      description: '',
    });
    await pager.updateEntry(1, {
      label: 'Boulangerie',
      category_id: null,
      date: '2026-03-05',
      amount: -12.4,
      description: '',
    });
    await pager.deleteEntry(1);

    expect(entriesApi.createEntry).toHaveBeenCalledWith(1, expect.any(Object));
    expect(entriesApi.updateEntry).toHaveBeenCalledWith(1, expect.any(Object));
    expect(entriesApi.deleteEntry).toHaveBeenCalledWith(1);
    expect(entriesApi.listEntries).not.toHaveBeenCalled();
  });
});
