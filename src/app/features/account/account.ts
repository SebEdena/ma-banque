import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  numberAttribute,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCalendarClock,
  lucideChevronRight,
  lucideChevronsUpDown,
  lucideCircleCheck,
  lucidePlus,
  lucideRotateCcw,
  lucideSearch,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmDatePickerImports } from '@spartan-ng/helm/date-picker';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { AccountsStore } from '@data/accounts/accounts-store';
import { CategoryInput, parseCategoryError } from '@data/categories/categories-api';
import { CategoriesStore } from '@data/categories/categories-store';
import { CurrencyFormatPipe } from '@core/display-settings/currency-format.pipe';
import { DisplaySettingsService } from '@core/display-settings/display-settings';
import { formatDate, parseFormattedDate } from '@core/display-settings/format';
import {
  ENTRY_INVALID_AMOUNT_MESSAGE,
  Entry,
  EntryInput,
  SortDirection,
  parseEntryError,
} from '@data/entries/entries-api';
import { EntriesPager, PageQuery } from '@data/entries/entries-pager';
import {
  ReconciliationApi,
  ReconciliationSummary,
  parseReconciliationError,
} from '@data/reconciliation/reconciliation-api';
import {
  RecurringRulesApi,
  generatedEntriesMessage,
  parseRecurringError,
} from '@data/recurring-rules/recurring-rules-api';
import { CategoryModal } from '@features/settings/categories/category-modal/category-modal';
import { formatAmountInput } from '@shared/amount-input/amount-input';
import { ConfirmDialog } from '@shared/confirm-dialog/confirm-dialog';
import { parseIsoDate, todayIso, toIsoDate } from '@shared/iso-date/iso-date';
import { provideCatalogIcons } from '@shared/pickers/icon-catalog';
import { EntryDraft, EntryForm, EntryFormField } from './entry-form/entry-form';
import { EntryRow } from './entry-row/entry-row';
import { ReconciliationPanel } from './reconciliation-panel/reconciliation-panel';
import { RecurringRulesModal } from './recurring-rules-modal/recurring-rules-modal';
import { RowCategory, SYSTEM_CATEGORY, UNCATEGORIZED } from './row-category';

/** Rows left below the viewport before the next page is requested. */
const PREFETCH_MARGIN = 20;

/** Row height in pixels, fixed so CDK Virtual Scroll can size the scrollbar. */
const ROW_HEIGHT = 66;

/** Which row the inline form is open on: the creation row, or an entry's id. */
type EditTarget = 'new' | number;

/**
 * The row column a click landed in, by the testid of the element it happened
 * over, so the form that replaces the row opens on the matching field. Zones
 * outside this map (the description line, the row's own padding) fall back to
 * the label, which is also what the keyboard path gets.
 */
const FIELD_BY_ZONE: Readonly<Record<string, EntryFormField>> = {
  'entry-date': 'date',
  'entry-category': 'category',
  'entry-label': 'label',
  'entry-amount': 'amount',
};

/** Which field `startEdit` should hand the form, given the click that opened it. */
function clickedField(event: Event | undefined): EntryFormField {
  const target = event?.target;
  if (!(target instanceof Element)) {
    return 'label';
  }
  const zone = target.closest('[data-testid]')?.getAttribute('data-testid') ?? '';
  return FIELD_BY_ZONE[zone] ?? 'label';
}

function emptyDraft(): EntryDraft {
  return {
    label: '',
    description: '',
    date: todayIso(),
    categoryId: null,
    amount: '',
  };
}

/**
 * The account entries screen (business requirements §4.3): the account's
 * register as a virtual-scrolled list, most-recent-first by default, with a
 * date-range filter, a reverse-order control, jump-to-date, inline
 * creation/editing, deletion and the per-row reconciled toggle.
 *
 * The container of the screen: it owns the editing/draft UI state and
 * delegates a row's markup to the presentational `EntryRow`/`EntryForm`.
 * The paging and CRUD calls themselves live in `EntriesPager` (component-
 * scoped, see `providers` below — this account's entries aren't shared with
 * any other surface) and `CategoriesStore` (a singleton, shared with the
 * Settings category list).
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
    ReconciliationPanel,
    RecurringRulesModal,
    ...HlmDatePickerImports,
    ...HlmTooltipImports,
  ],
  templateUrl: './account.html',
  styleUrls: ['./account.css', './accent.css'],
  providers: [
    EntriesPager,
    provideCatalogIcons(),
    provideIcons({
      lucideCalendarClock,
      lucideChevronRight,
      lucideChevronsUpDown,
      lucideCircleCheck,
      lucidePlus,
      lucideRotateCcw,
      lucideSearch,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Account {
  private readonly accountsStore = inject(AccountsStore);
  private readonly categoriesStore = inject(CategoriesStore);
  private readonly pager = inject(EntriesPager);
  private readonly reconciliationApi = inject(ReconciliationApi);
  private readonly recurringRulesApi = inject(RecurringRulesApi);

  protected readonly displaySettings = inject(DisplaySettingsService);

  private readonly viewport = viewChild(CdkVirtualScrollViewport);

  readonly accountId = input.required({ transform: numberAttribute });

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

  /**
   * The reconciliation panel's disclosure state. Starts closed on every entry
   * to the screen and is never persisted (`docs/spec/08-reconciliation.md`).
   */
  protected readonly panelOpen = signal(false);

  /** The panel checkbox's own value, kept even while the panel is closed. */
  protected readonly unreconciledOnly = signal(false);

  /**
   * The filter as the query actually sees it. Collapsing the panel disables
   * the filter's effect whatever the checkbox says — expressed here as one
   * expression rather than as a flag some close handler must remember to
   * reset.
   */
  protected readonly filterUnreconciled = computed(
    () => this.panelOpen() && this.unreconciledOnly(),
  );

  /** The panel's figures, fetched when it opens and after anything that moves them. */
  protected readonly summary = signal<ReconciliationSummary | null>(null);

  protected readonly entries = this.pager.entries;
  protected readonly hasMore = this.pager.hasMore;
  protected readonly loading = this.pager.loading;
  protected readonly filtersActive = computed(() => this.from() !== null || this.to() !== null);

  protected readonly fromDate = computed(() => {
    const value = this.from();
    return value !== null ? parseIsoDate(value) : undefined;
  });

  protected readonly toDate = computed(() => {
    const value = this.to();
    return value !== null ? parseIsoDate(value) : undefined;
  });

  protected readonly jumpDate = computed(() => {
    const value = this.jumpTarget();
    return value !== '' ? parseIsoDate(value) : undefined;
  });

  protected readonly formatFilterDate = computed(() => {
    const format = this.displaySettings.dateFormat();
    return (date: Date): string => formatDate(date, format);
  });

  /** Typing/edit format matches the display format — no surprise reformat on focus. */
  protected readonly parseFilterDate = (value: string): Date | null =>
    parseFormattedDate(value, this.displaySettings.dateFormat());

  protected readonly rowHeight = ROW_HEIGHT;
  protected readonly trackById = (_index: number, entry: Entry): number => entry.id;

  protected readonly categories = this.categoriesStore.categories;
  private readonly categoriesById = computed(
    () => new Map(this.categories().map((category) => [category.id, category])),
  );

  /** The row the inline form is open on, or `null` when the list is idle. */
  protected readonly editing = signal<EditTarget | null>(null);
  protected readonly saving = signal(false);
  protected readonly confirmingDelete = signal<Entry | null>(null);

  /** Whether the account's recurring rules modal is open over the register. */
  protected readonly rulesOpen = signal(false);

  /** Whether the quick-create category modal is open over the form. */
  protected readonly creatingCategory = signal(false);
  protected readonly savingCategory = signal(false);

  /** What the open form edits — see `EntryDraft` for why the amount is text. */
  protected readonly draft = signal<EntryDraft>(emptyDraft());

  /** Which field the form about to open should focus — see `clickedField`. */
  protected readonly focusField = signal<EntryFormField>('label');

  /**
   * The reconciled flag while creating. Not part of the draft: on an
   * existing entry the form's checkbox goes straight to `set_reconciled`,
   * and only the creation row has a flag left to save.
   */
  protected readonly draftReconciled = signal(false);

  /**
   * The in-flight (or settled) `openAccount` call per account, so the filter
   * and sort controls — which re-run the effect below — don't ask the backend
   * to generate again for an account it has already brought up to today.
   */
  private readonly generation = new Map<number, Promise<void>>();

  constructor() {
    effect(() => {
      const query = this.query();
      this.editing.set(null);
      void this.generateThenReload(query);
    });
  }

  /**
   * Generation runs before the register's first read, so the entries it
   * writes are in the page the screen renders rather than appearing on the
   * next reload. A failure is toasted and the register still loads: not
   * knowing today's rent must not make the account unreadable.
   */
  private async generateThenReload(query: PageQuery): Promise<void> {
    await this.generateDue(query.accountId);
    await this.pager.reload(query);
  }

  private generateDue(accountId: number): Promise<void> {
    const pending =
      this.generation.get(accountId) ??
      this.recurringRulesApi.openAccount(accountId).then(
        (count) => {
          if (count > 0) {
            toast.info(generatedEntriesMessage(count));
          }
        },
        (error: unknown) => {
          toast.error(parseRecurringError(error));
        },
      );

    this.generation.set(accountId, pending);
    return pending;
  }

  /**
   * Opens or closes the panel. Opening ticks "unreconciled only" — the common
   * case is that the panel was opened in order to reconcile — and asks for the
   * figures; closing leaves the checkbox alone, since `filterUnreconciled`
   * already makes it inert.
   */
  protected togglePanel(): void {
    const opening = !this.panelOpen();
    this.panelOpen.set(opening);
    if (opening) {
      this.unreconciledOnly.set(true);
      void this.refreshSummary();
    }
  }

  protected async onBankBalanceChanged(amount: number): Promise<void> {
    await this.storeSummary(() => this.reconciliationApi.setBankBalance(this.accountId(), amount));
  }

  protected async onStatementDateChanged(date: string): Promise<void> {
    await this.storeSummary(() => this.reconciliationApi.setStatementDate(this.accountId(), date));
  }

  private refreshSummary(): Promise<void> {
    return this.storeSummary(() => this.reconciliationApi.summary(this.accountId()));
  }

  /** Every reconciliation command answers with the recomputed summary. */
  private async storeSummary(call: () => Promise<ReconciliationSummary>): Promise<void> {
    try {
      this.summary.set(await call());
    } catch (error) {
      toast.error(parseReconciliationError(error));
    }
  }

  protected toggleSort(): void {
    this.sort.update((sort) => (sort === 'DESC' ? 'ASC' : 'DESC'));
  }

  protected onFromChange(date: Date | null): void {
    this.from.set(date ? toIsoDate(date) : null);
  }

  protected onToChange(date: Date | null): void {
    this.to.set(date ? toIsoDate(date) : null);
  }

  protected onJumpChange(date: Date | null): void {
    this.jumpTarget.set(date ? toIsoDate(date) : '');
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
    void this.pager.loadMore(this.query());
  }

  /** Loads forward until the target date is in the buffer, then scrolls to it. */
  protected async jumpToDate(): Promise<void> {
    const target = this.jumpTarget();
    if (target === '') {
      return;
    }

    const index = await this.pager.jumpTo(this.query(), target);
    if (index !== -1) {
      this.viewport()?.scrollToIndex(index, 'smooth');
    }
  }

  /** Opens the creation row at the top of the list, on an empty draft. */
  protected startCreate(): void {
    this.resetDraft();
    this.focusField.set('label');
    this.editing.set('new');
  }

  /** Turns an existing row into the inline form; system entries stay read-only. */
  protected startEdit(entry: Entry, event?: Event): void {
    if (entry.is_system || this.editing() === entry.id) {
      return;
    }

    this.resetDraft();
    this.focusField.set(clickedField(event));
    this.draft.set({
      label: entry.label,
      description: entry.description,
      date: entry.date,
      categoryId: entry.category_id,
      amount: formatAmountInput(entry.amount),
    });
    this.editing.set(entry.id);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
  }

  /**
   * Saves what the quick-create modal found valid, then selects the created
   * category on the row straight away. `CategoryModal` only validates and
   * builds the input (presentational); this container owns the backend call,
   * same split as `EntryForm`/`Account` for the entry itself. The list is
   * already up to date once this resolves — `CategoriesStore.create`
   * refetches before this handler continues.
   */
  protected async onCategorySubmitted(input: CategoryInput): Promise<void> {
    this.savingCategory.set(true);
    try {
      const category = await this.categoriesStore.create(input);
      this.creatingCategory.set(false);
      this.draft.update((draft) => ({ ...draft, categoryId: category.id }));
    } catch (error) {
      toast.error(parseCategoryError(error));
    } finally {
      this.savingCategory.set(false);
    }
  }

  /**
   * The unreadable-amount toast `docs/spec/06-entries.md` asks for. The form
   * raises the inline half itself, off its own schema.
   */
  protected rejectAmount(): void {
    toast.error(ENTRY_INVALID_AMOUNT_MESSAGE);
  }

  /**
   * Saves a draft the form has already found valid — it hands over the amount
   * it parsed, so what counts as saveable is stated in one place only.
   */
  protected async save(amount: number): Promise<void> {
    const target = this.editing();
    if (target === null || this.saving()) {
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
          ? await this.pager.createEntry(this.accountId(), input)
          : await this.pager.updateEntry(target, input);

      // The row exists from here on, so the form closes before the checkbox
      // call: a failure there must not leave it open on an entry that saving
      // again would duplicate. `create_entry` doesn't take the flag — the
      // creation row's checkbox goes through the row toggle's command.
      this.editing.set(null);
      if (target === 'new' && this.draftReconciled()) {
        await this.pager.setReconciled(saved.id, true);
      }
    } catch (error) {
      toast.error(parseEntryError(error));
    } finally {
      this.saving.set(false);
      void this.pager.reload(this.query());
    }
  }

  /**
   * Toggles an existing entry's reconciled flag on its own, independent of
   * whether the row is being edited. `EntriesPager` patches the one row
   * rather than refetching, so the list doesn't jump under the pointer — but
   * with the filter on, the row no longer matches the predicate the list
   * claims to obey, so that page is reloaded instead. Either way the panel's
   * figures just moved, so they are refetched too.
   */
  protected async toggleReconciled(entry: Entry): Promise<void> {
    try {
      await this.pager.setReconciled(entry.id, !entry.reconciled);
      if (this.filterUnreconciled()) {
        await this.pager.reload(this.query());
      }
    } catch (error) {
      toast.error(parseEntryError(error));
    }

    if (this.panelOpen()) {
      void this.refreshSummary();
    }
  }

  protected async confirmDelete(): Promise<void> {
    const entry = this.confirmingDelete();
    if (entry === null) {
      return;
    }

    this.confirmingDelete.set(null);
    try {
      await this.pager.deleteEntry(entry.id);
      this.editing.set(null);
      void this.pager.reload(this.query());
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
    this.draft.set(emptyDraft());
    this.draftReconciled.set(false);
  }

  private query(): PageQuery {
    return {
      accountId: this.accountId(),
      sort: this.sort(),
      from: this.from(),
      to: this.to(),
      unreconciledOnly: this.filterUnreconciled(),
    };
  }
}
