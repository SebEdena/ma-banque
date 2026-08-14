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
  lucideChevronRight,
  lucideChevronsUpDown,
  lucidePlus,
  lucideRotateCcw,
  lucideSearch,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';

import { todayIso } from '@core/accounts-api/accounts-api';
import { AccountsStore } from '@core/accounts-api/accounts-store';
import { CategoriesApi, Category, parseCategoryError } from '@core/categories-api/categories-api';
import { CurrencyFormatPipe } from '@core/display-settings/currency-format.pipe';
import { DisplaySettingsService } from '@core/display-settings/display-settings';
import {
  ENTRY_INVALID_AMOUNT_MESSAGE,
  EntriesApi,
  Entry,
  EntryInput,
  SortDirection,
  parseEntryError,
} from '@core/entries-api/entries-api';
import { CategoryModal } from '@features/settings/categories/category-modal/category-modal';
import { ConfirmDialog } from '@shared/confirm-dialog/confirm-dialog';
import { provideCatalogIcons } from '@shared/pickers/icon-catalog';
import { EntryDraft, EntryForm } from './entry-form/entry-form';
import { EntryRow } from './entry-row/entry-row';
import { RowCategory, SYSTEM_CATEGORY, UNCATEGORIZED } from './row-category';

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

/** Which row the inline form is open on: the creation row, or an entry's id. */
type EditTarget = 'new' | number;

function emptyDraft(): EntryDraft {
  return {
    label: '',
    description: '',
    date: todayIso(),
    categoryId: null,
    amount: '-',
  };
}

/** Everything a `list_entries` page request depends on besides its offset. */
interface PageQuery {
  accountId: number;
  sort: SortDirection;
  from: string | null;
  to: string | null;
}

/**
 * The account entries screen (business requirements §4.3): the account's
 * register as a virtual-scrolled list, most-recent-first by default, with a
 * date-range filter, a reverse-order control, jump-to-date, inline
 * creation/editing, deletion and the per-row reconciled toggle.
 *
 * The container of the screen: it owns the API calls, the paging state and
 * the draft the inline form edits, and delegates a row's markup to the
 * presentational `EntryRow`/`EntryForm`.
 *
 * Pages are appended to one buffer that always starts at offset 0, because
 * CDK Virtual Scroll renders a single array: a page starting further in
 * would have nothing to sit behind it. That's also why jump-to-date loads
 * forward rather than using `list_entries`' `jump_to_date` shortcut, which
 * returns a page without saying which offset it came from.
 */
@Component({
  selector: 'app-account',
  imports: [
    RouterLink,
    NgIcon,
    ScrollingModule,
    CurrencyFormatPipe,
    ConfirmDialog,
    CategoryModal,
    EntryRow,
    EntryForm,
  ],
  templateUrl: './account.html',
  styleUrls: ['./account.css', './accent.css'],
  providers: [
    provideCatalogIcons(),
    provideIcons({
      lucideChevronRight,
      lucideChevronsUpDown,
      lucidePlus,
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
  protected readonly trackById = (_index: number, entry: Entry): number => entry.id;

  protected readonly categories = signal<Category[]>([]);
  private readonly categoriesById = computed(
    () => new Map(this.categories().map((category) => [category.id, category])),
  );

  /** The row the inline form is open on, or `null` when the list is idle. */
  protected readonly editing = signal<EditTarget | null>(null);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly confirmingDelete = signal<Entry | null>(null);

  /** Whether the quick-create category modal is open over the form. */
  protected readonly creatingCategory = signal(false);

  /** What the open form edits — see `EntryDraft` for why the amount is text. */
  protected readonly draft = signal<EntryDraft>(emptyDraft());

  /**
   * The reconciled flag while creating. Not part of the draft: on an
   * existing entry the form's checkbox goes straight to `set_reconciled`,
   * and only the creation row has a flag left to save.
   */
  protected readonly draftReconciled = signal(false);

  protected readonly labelMissing = computed(() => this.draft().label.trim() === '');

  /**
   * Whether the amount field's text isn't a number. Shown inline once a save
   * has been attempted, on top of the toast `save()` raises: the toast is
   * what `docs/spec/06-entries.md` asks for, the inline error is what tells
   * the user which field to fix without reading it.
   */
  protected readonly amountInvalid = computed(() => this.amountValue() === null);

  /**
   * Bumped on every filter/sort/account change so a page that arrives after
   * the query moved on is discarded instead of appended to the wrong list.
   */
  private generation = 0;

  constructor() {
    void this.loadCategories();

    effect(() => {
      this.editing.set(null);
      this.reload();
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

  /** Opens the creation row at the top of the list, on an empty draft. */
  protected startCreate(): void {
    this.resetDraft();
    this.editing.set('new');
  }

  /** Turns an existing row into the inline form; system entries stay read-only. */
  protected startEdit(entry: Entry): void {
    if (entry.is_system || this.editing() === entry.id) {
      return;
    }

    this.resetDraft();
    this.draft.set({
      label: entry.label,
      description: entry.description,
      date: entry.date,
      categoryId: entry.category_id,
      amount: String(entry.amount),
    });
    this.editing.set(entry.id);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
  }

  /**
   * Selects the quick-created category on the row straight away, then
   * refetches the list so the new option arrives in the backend's own name
   * order rather than appended to the end.
   */
  protected async onCategoryCreated(category: Category): Promise<void> {
    this.creatingCategory.set(false);
    this.draft.update((draft) => ({ ...draft, categoryId: category.id }));
    await this.loadCategories();
  }

  protected async save(): Promise<void> {
    this.submitted.set(true);
    const target = this.editing();
    if (target === null || this.labelMissing() || this.saving()) {
      return;
    }

    const amount = this.amountValue();
    if (amount === null) {
      toast.error(ENTRY_INVALID_AMOUNT_MESSAGE);
      return;
    }

    const draft = this.draft();
    const input: EntryInput = {
      label: draft.label.trim(),
      category_id: draft.categoryId,
      date: draft.date,
      amount,
      description: draft.description.trim(),
    };

    this.saving.set(true);
    try {
      const saved =
        target === 'new'
          ? await this.entriesApi.createEntry(this.accountId(), input)
          : await this.entriesApi.updateEntry(target, input);

      // The row exists from here on, so the form closes before the checkbox
      // call: a failure there must not leave it open on an entry that saving
      // again would duplicate. `create_entry` doesn't take the flag — the
      // creation row's checkbox goes through the row toggle's command.
      this.editing.set(null);
      if (target === 'new' && this.draftReconciled()) {
        await this.entriesApi.setReconciled(saved.id, true);
      }
    } catch (error) {
      toast.error(parseEntryError(error));
    } finally {
      this.saving.set(false);
      this.reload();
    }
  }

  /**
   * Toggles an existing entry's reconciled flag on its own, independent of
   * whether the row is being edited, and patches the one row rather than
   * refetching so the list doesn't jump under the pointer.
   */
  protected async toggleReconciled(entry: Entry): Promise<void> {
    try {
      const updated = await this.entriesApi.setReconciled(entry.id, !entry.reconciled);
      this.entries.update((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
    } catch (error) {
      toast.error(parseEntryError(error));
    }
  }

  protected async confirmDelete(): Promise<void> {
    const entry = this.confirmingDelete();
    if (entry === null) {
      return;
    }

    this.confirmingDelete.set(null);
    try {
      await this.entriesApi.deleteEntry(entry.id);
      this.editing.set(null);
      this.reload();
    } catch (error) {
      toast.error(parseEntryError(error));
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

  private resetDraft(): void {
    this.submitted.set(false);
    this.draft.set(emptyDraft());
    this.draftReconciled.set(false);
  }

  /**
   * The amount field's text as the signed major-unit number to send, or
   * `null` when it isn't a number — including when only the sign was picked.
   * What `money::to_cents` would reject on the far side (sub-cent precision
   * especially) is left for it to reject, so both paths say the same thing.
   */
  private amountValue(): number | null {
    const raw = this.draft().amount.trim().replaceAll(',', '.');
    const digits = raw.replace(/^-/, '');
    const magnitude = Number(digits);
    if (digits === '' || !Number.isFinite(magnitude)) {
      return null;
    }
    return raw.startsWith('-') ? -magnitude : magnitude;
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

    await this.fetchPage(this.generation, this.query(), this.entries().length);
  }

  private query(): PageQuery {
    return {
      accountId: this.accountId(),
      sort: this.sort(),
      from: this.from(),
      to: this.to(),
    };
  }

  /**
   * Drops the buffer and refetches it from the top — what every write goes
   * through, since a new or edited entry can land anywhere in the current
   * order.
   */
  private reload(): void {
    const query = this.query();
    this.generation += 1;
    this.entries.set([]);
    this.hasMore.set(false);
    void this.fetchPage(this.generation, query, 0);
  }

  private async fetchPage(generation: number, query: PageQuery, offset: number): Promise<void> {
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
