import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronRight,
  lucideChevronsUpDown,
  lucideFlag,
  lucideLock,
  lucideRotateCcw,
  lucideSearch,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';

import { parseIsoDate } from '@core/accounts-api/accounts-api';
import { AccountsStore } from '@core/accounts-api/accounts-store';
import { CategoriesApi, Category, parseCategoryError } from '@core/categories-api/categories-api';
import { CurrencyFormatPipe } from '@core/display-settings/currency-format.pipe';
import { DateFormatPipe } from '@core/display-settings/date-format.pipe';
import { DisplaySettingsService } from '@core/display-settings/display-settings';
import { EntriesApi, Entry, SortDirection, parseEntryError } from '@core/entries-api/entries-api';
import { provideCatalogIcons } from '@shared/pickers/icon-catalog';

/**
 * How many entries a `list_entries` call asks for. Not user-configurable
 * (`docs/spec/06-entries.md`) — big enough that scrolling rarely waits on a
 * round trip, small enough that opening an account is instant.
 */
const PAGE_SIZE = 50;

/** Rows left below the viewport before the next page is requested. */
const PREFETCH_MARGIN = 20;

/** Row height in pixels, fixed so CDK Virtual Scroll can size the scrollbar. */
const ROW_HEIGHT = 66;

/** What a row shows in its category column, system entries included. */
interface RowCategory {
  name: string;
  color: string;
  icon: string;
}

const SYSTEM_CATEGORY: RowCategory = {
  name: 'Solde initial',
  color: '#64748b',
  icon: 'lucideFlag',
};

const UNCATEGORIZED: RowCategory = {
  name: '—',
  color: '#94a3b8',
  icon: 'lucideEllipsis',
};

/**
 * The account entries screen (business requirements §4.3): the account's
 * register as a virtual-scrolled list, most-recent-first by default, with a
 * date-range filter, a reverse-order control and jump-to-date.
 *
 * Read-only for now — inline creation/editing, deletion and the reconciled
 * toggle land with the rest of `docs/spec/06-entries.md`.
 *
 * Pages are appended to one buffer that always starts at offset 0, because
 * CDK Virtual Scroll renders a single array: a page starting further in
 * would have nothing to sit behind it. That's also why jump-to-date loads
 * forward rather than using `list_entries`' `jump_to_date` shortcut, which
 * returns a page without saying which offset it came from.
 */
@Component({
  selector: 'app-account',
  imports: [RouterLink, NgIcon, ScrollingModule, DateFormatPipe, CurrencyFormatPipe],
  templateUrl: './account.html',
  styleUrl: './account.css',
  providers: [
    provideCatalogIcons(),
    provideIcons({
      lucideCheck,
      lucideChevronRight,
      lucideChevronsUpDown,
      lucideFlag,
      lucideLock,
      lucideRotateCcw,
      lucideSearch,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Account {
  private readonly route = inject(ActivatedRoute);
  private readonly accountsStore = inject(AccountsStore);
  private readonly entriesApi = inject(EntriesApi);
  private readonly categoriesApi = inject(CategoriesApi);

  protected readonly displaySettings = inject(DisplaySettingsService);

  private readonly viewport = viewChild(CdkVirtualScrollViewport);

  /**
   * The router reuses this component across `/account/:id` navigations, so
   * the id has to come from the observable rather than a snapshot.
   */
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  protected readonly accountId = computed(() => Number(this.params().get('id')));

  protected readonly account = computed(
    () =>
      [...this.accountsStore.active(), ...this.accountsStore.archived()].find(
        (candidate) => candidate.id === this.accountId(),
      ) ?? null,
  );

  protected readonly sort = signal<SortDirection>('DESC');
  protected readonly from = signal<string | null>(null);
  protected readonly to = signal<string | null>(null);
  protected readonly jumpTarget = signal('');

  protected readonly entries = signal<Entry[]>([]);
  protected readonly hasMore = signal(false);
  protected readonly loading = signal(false);
  protected readonly filtersActive = computed(() => this.from() !== null || this.to() !== null);

  protected readonly rowHeight = ROW_HEIGHT;
  protected readonly parseIsoDate = parseIsoDate;
  protected readonly trackById = (_index: number, entry: Entry): number => entry.id;

  private readonly categories = signal<Category[]>([]);
  private readonly categoriesById = computed(
    () => new Map(this.categories().map((category) => [category.id, category])),
  );

  /**
   * Bumped on every filter/sort/account change so a page that arrives after
   * the query moved on is discarded instead of appended to the wrong list.
   */
  private generation = 0;

  constructor() {
    void this.loadCategories();

    effect(() => {
      const accountId = this.accountId();
      const sort = this.sort();
      const from = this.from();
      const to = this.to();

      this.generation += 1;
      this.entries.set([]);
      this.hasMore.set(false);
      void this.fetchPage(this.generation, { accountId, sort, from, to }, 0);
    });
  }

  protected toggleSort(): void {
    this.sort.update((sort) => (sort === 'DESC' ? 'ASC' : 'DESC'));
  }

  protected setFrom(value: string): void {
    this.from.set(value || null);
  }

  protected setTo(value: string): void {
    this.to.set(value || null);
  }

  protected resetFilters(): void {
    this.from.set(null);
    this.to.set(null);
    this.jumpTarget.set('');
  }

  /** Requests the next page once the viewport is within a page's end. */
  protected onScrolledIndex(index: number): void {
    if (index + PREFETCH_MARGIN < this.entries().length) {
      return;
    }
    void this.loadMore();
  }

  /**
   * Loads forward until the buffer holds the entry the target date anchors
   * on, then scrolls to it. The anchor mirrors `offset_for_date`: the first
   * entry at or before the target most-recent-first, the first at or after
   * it oldest-first.
   */
  protected async jumpToDate(): Promise<void> {
    const target = this.jumpTarget();
    if (target === '') {
      return;
    }

    while (this.anchorIndex(target) === -1 && this.hasMore()) {
      const before = this.entries().length;
      await this.loadMore();
      if (this.entries().length === before) {
        break;
      }
    }

    const index = this.anchorIndex(target);
    if (index !== -1) {
      this.viewport()?.scrollToIndex(index, 'smooth');
    }
  }

  protected categoryOf(entry: Entry): RowCategory {
    if (entry.is_system) {
      return SYSTEM_CATEGORY;
    }
    if (entry.category_id === null) {
      return UNCATEGORIZED;
    }
    return this.categoriesById().get(entry.category_id) ?? UNCATEGORIZED;
  }

  private anchorIndex(target: string): number {
    return this.entries().findIndex((entry) =>
      this.sort() === 'DESC' ? entry.date <= target : entry.date >= target,
    );
  }

  private async loadMore(): Promise<void> {
    if (this.loading() || !this.hasMore()) {
      return;
    }

    await this.fetchPage(
      this.generation,
      {
        accountId: this.accountId(),
        sort: this.sort(),
        from: this.from(),
        to: this.to(),
      },
      this.entries().length,
    );
  }

  private async fetchPage(
    generation: number,
    query: { accountId: number; sort: SortDirection; from: string | null; to: string | null },
    offset: number,
  ): Promise<void> {
    this.loading.set(true);
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

      this.entries.update((current) =>
        offset === 0 ? page.entries : [...current, ...page.entries],
      );
      this.hasMore.set(page.has_more);
    } catch (error) {
      toast.error(parseEntryError(error));
    } finally {
      if (generation === this.generation) {
        this.loading.set(false);
      }
    }
  }

  private async loadCategories(): Promise<void> {
    try {
      this.categories.set(await this.categoriesApi.listCategories());
    } catch (error) {
      toast.error(parseCategoryError(error));
    }
  }
}
