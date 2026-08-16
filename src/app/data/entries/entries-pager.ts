import { Service, inject, signal } from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';

import { Entry, EntriesApi, EntryInput, SortDirection, parseEntryError } from './entries-api';

/** How many entries a page request asks for — see `Account`'s own constant for why. */
const PAGE_SIZE = 50;

/** Everything a `list_entries` page request depends on besides its offset. */
export interface PageQuery {
  accountId: number;
  sort: SortDirection;
  from: string | null;
  to: string | null;
}

/**
 * The paginated, filterable entry buffer for one account (business
 * requirements §4.3): owns the fetch/page/reload machinery behind the
 * entries screen, so the component is left with editing/draft UI state only.
 *
 * Not a singleton like `AccountsStore` — nothing else on screen needs this
 * account's entries, so `autoProvided: false` keeps it out of the root
 * injector and it's provided per `Account` instance instead (see that
 * component's `providers`).
 *
 * Pages are appended to one buffer that always starts at offset 0, because
 * CDK Virtual Scroll renders a single array: a page starting further in
 * would have nothing to sit behind it. `jumpTo` therefore loads forward
 * rather than using `list_entries`' `jump_to_date` shortcut, which returns a
 * page without saying which offset it came from.
 */
@Service({ autoProvided: false })
export class EntriesPager {
  private readonly entriesApi = inject(EntriesApi);

  private readonly entriesSignal = signal<Entry[]>([]);
  private readonly hasMoreSignal = signal(false);
  private readonly loadingSignal = signal(false);

  readonly entries = this.entriesSignal.asReadonly();
  readonly hasMore = this.hasMoreSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  /**
   * Bumped on every `reload`, so a page that arrives after the query moved
   * on is discarded instead of appended to the wrong list.
   */
  private generation = 0;

  /** Drops the buffer and refetches it from the top — what a filter/sort/account change does. */
  async reload(query: PageQuery): Promise<void> {
    this.generation += 1;
    this.entriesSignal.set([]);
    this.hasMoreSignal.set(false);
    await this.fetchPage(this.generation, query, 0);
  }

  /** Requests the next page and appends it, once the viewport is close to the buffer's end. */
  async loadMore(query: PageQuery): Promise<void> {
    if (this.loadingSignal() || !this.hasMoreSignal()) {
      return;
    }
    await this.fetchPage(this.generation, query, this.entriesSignal().length);
  }

  /**
   * Loads forward until the buffer holds the entry the target date anchors
   * on, then returns its index — or `-1` if the buffer ran out first. The
   * anchor mirrors `offset_for_date`: the first entry at or before the
   * target most-recent-first, the first at or after it oldest-first.
   */
  async jumpTo(query: PageQuery, target: string): Promise<number> {
    while (this.anchorIndex(query.sort, target) === -1 && this.hasMoreSignal()) {
      const before = this.entriesSignal().length;
      await this.loadMore(query);
      if (this.entriesSignal().length === before) {
        break;
      }
    }
    return this.anchorIndex(query.sort, target);
  }

  createEntry(accountId: number, input: EntryInput): Promise<Entry> {
    return this.entriesApi.createEntry(accountId, input);
  }

  updateEntry(id: number, input: EntryInput): Promise<Entry> {
    return this.entriesApi.updateEntry(id, input);
  }

  deleteEntry(id: number): Promise<void> {
    return this.entriesApi.deleteEntry(id);
  }

  /**
   * Toggles reconciliation and patches the buffered row in place, so the
   * list doesn't jump under the pointer — no full `reload` needed.
   */
  async setReconciled(id: number, reconciled: boolean): Promise<Entry> {
    const updated = await this.entriesApi.setReconciled(id, reconciled);
    this.entriesSignal.update((current) =>
      current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
    );
    return updated;
  }

  private anchorIndex(sort: SortDirection, target: string): number {
    return this.entriesSignal().findIndex((entry) =>
      sort === 'DESC' ? entry.date <= target : entry.date >= target,
    );
  }

  private async fetchPage(generation: number, query: PageQuery, offset: number): Promise<void> {
    this.loadingSignal.set(true);
    try {
      const page = await this.entriesApi.listEntries(query.accountId, {
        from: query.from,
        to: query.to,
        sort: query.sort,
        page_size: PAGE_SIZE,
        offset,
        jump_to_date: null,
      });

      if (generation !== this.generation) {
        return;
      }

      this.entriesSignal.update((current) =>
        offset === 0 ? page.entries : [...current, ...page.entries],
      );
      this.hasMoreSignal.set(page.has_more);
    } catch (error) {
      toast.error(parseEntryError(error));
    } finally {
      if (generation === this.generation) {
        this.loadingSignal.set(false);
      }
    }
  }
}
