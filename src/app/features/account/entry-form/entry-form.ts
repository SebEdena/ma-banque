import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { FieldTree, form, requiredError, schema, submit, validate } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucidePlus, lucideX } from '@ng-icons/lucide';
import { BrnSelect } from '@spartan-ng/brain/select';
import { HlmDatePickerImports } from '@spartan-ng/helm/date-picker';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { Category } from '@data/categories/categories-api';
import type { DateFormat } from '@core/display-settings/display-settings.types';
import { formatDate, parseFormattedDate } from '@core/display-settings/format';
import { AmountInput, parseAmount } from '@shared/amount-input/amount-input';
import { parseIsoDate, toIsoDate } from '@shared/iso-date/iso-date';
import { provideCatalogIcons } from '@shared/pickers/icon-catalog';
import { RowCategory, UNCATEGORIZED } from '../row-category';

/**
 * What the inline row form edits. `amount` is the field's **raw text, sign
 * included** — the debit/credit selector is a view over that sign rather
 * than a second piece of state, so the two can't drift apart
 * (`docs/spec/06-entries.md`).
 */
export interface EntryDraft {
  label: string;
  description: string;
  date: string;
  categoryId: number | null;
  amount: string;
}

const LABEL_REQUIRED_MESSAGE = 'Libellé obligatoire';
const AMOUNT_INVALID_MESSAGE = 'Montant invalide';

/**
 * What makes a draft saveable, expressed once here rather than recomputed by
 * whoever holds the draft. Both rules are presentation-layer: the label one
 * mirrors `usecases::entry`'s `EmptyLabel`, and the amount one only asks
 * whether the text reads as a number. Sub-cent precision is deliberately not
 * checked — that is `money::to_cents`' rule, and it stays a toast raised by
 * the backend rather than a second copy of the rule living here.
 */
const entryDraftSchema = schema<EntryDraft>((draft) => {
  validate(draft.label, ({ value }) =>
    value().trim() === '' ? requiredError({ message: LABEL_REQUIRED_MESSAGE }) : null,
  );
  validate(draft.amount, ({ value }) =>
    parseAmount(value()) === null
      ? { kind: 'unreadableAmount', message: AMOUNT_INVALID_MESSAGE }
      : null,
  );
});

/**
 * The category select's quick-create option. A sentinel option rather than a
 * button beside the field: an extra option keeps the affordance where the
 * user is already looking, instead of a second control competing for space.
 */
export const NEW_CATEGORY_VALUE = '__new__';

/**
 * Which field the form opens focused on — the one the user clicked in the
 * row it replaced, so the swap into edit mode lands the caret where the
 * pointer already was. `label` is the default, and what the keyboard path
 * (Enter on a focused row) gets.
 */
export type EntryFormField = 'date' | 'category' | 'label' | 'amount';

/**
 * The inline entry form, rendered in the creation row above the list and in
 * place of an edited row — one component instantiated twice rather than two
 * markups to keep in step. Only ever one at a time: the container's
 * `editing` signal is a single target.
 *
 * Presentational: it edits the `draft` model and emits intents. `reconciled`
 * is an input rather than part of the draft because on an existing entry the
 * checkbox goes straight to `set_reconciled` instead of through the save
 * button — which is the container's call to make, not this component's.
 *
 * It does own its own validation, through Signal Forms: `entryDraftSchema`
 * says what a saveable draft is, and `saved` only fires for one, carrying the
 * parsed amount so the container never re-reads the rule.
 */
@Component({
  selector: 'app-entry-form',
  imports: [
    NgIcon,
    AmountInput,
    ...HlmDatePickerImports,
    ...HlmSelectImports,
    ...HlmTooltipImports,
  ],
  templateUrl: './entry-form.html',
  styles: `
    :host {
      display: contents;
    }

    /*
      Every field in this row borrows the date picker's own focus ring shape
      (a 3px halo, not accent.css's outset outline) so the row reads as one
      set of fields — tinted with the account colour instead of the picker's
      neutral --ring token, so accent.css's §5 requirement still holds.
      Scoped here rather than added to the shared stylesheet: it's this
      row's own fields that need the picker's look, not a flavour other
      controls should reach for.
    */
    [data-focus-ring]:focus-visible {
      border-color: var(--account-color);
      box-shadow: 0 0 0 3px color-mix(in oklab, var(--account-color) 50%, transparent);
    }
  `,
  styleUrl: '../accent.css',
  providers: [provideCatalogIcons(), provideIcons({ lucideCheck, lucidePlus, lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryForm {
  readonly draft = model.required<EntryDraft>();
  readonly categories = input.required<Category[]>();
  readonly accountColor = input.required<string>();
  readonly reconciled = input.required<boolean>();
  readonly saving = input(false);
  readonly focusField = input<EntryFormField>('label');
  readonly dateFormat = input.required<DateFormat>();

  /** A save attempt on a valid draft, carrying its parsed signed amount. */
  readonly saved = output<number>();
  readonly cancelled = output<void>();
  readonly reconciledToggled = output<void>();
  readonly categoryCreateRequested = output<void>();

  /**
   * A save attempt the amount blocked. The inline error is this component's,
   * but `docs/spec/06-entries.md` also asks for a toast, and toasts belong to
   * the container.
   */
  readonly amountRejected = output<void>();

  /**
   * The date picker's own `<input>` lives inside its component's template,
   * so this reads the wrapper's host element rather than the field
   * directly — `focusRequestedField` reaches into it with `querySelector`.
   */
  private readonly dateField = viewChild.required('dateField', { read: ElementRef });
  private readonly categoryField = viewChild.required('categoryField', { read: ElementRef });
  private readonly categorySelect = viewChild.required(BrnSelect);
  private readonly labelField = viewChild.required<ElementRef<HTMLInputElement>>('labelField');
  private readonly amountField = viewChild.required<ElementRef<HTMLInputElement>>('amountField');

  protected readonly newCategoryValue = NEW_CATEGORY_VALUE;

  /** The draft as a validated field tree — see `entryDraftSchema`. */
  private readonly fields = form(this.draft, entryDraftSchema);

  protected readonly labelError = computed(() => this.messageOf(this.fields.label));
  protected readonly amountError = computed(() => this.messageOf(this.fields.amount));

  protected readonly isDebit = computed(() => this.draft().amount.trim().startsWith('-'));

  /** The swatch shown next to the category select. */
  protected readonly categorySwatch = computed<RowCategory>(() => {
    const id = this.draft().categoryId;
    return (
      (id === null ? undefined : this.categories().find((candidate) => candidate.id === id)) ??
      UNCATEGORIZED
    );
  });

  protected readonly categoryValue = computed<number | null>(() => this.draft().categoryId);

  /** The "Aucun poste" option's own swatch — same style as a real category's. */
  protected readonly uncategorized = UNCATEGORIZED;

  /** Trigger label for the selected value — the id itself isn't readable. */
  protected readonly categoryItemToString = (
    value: number | typeof NEW_CATEGORY_VALUE | null | undefined,
  ) => {
    if (value === null || value === undefined) {
      return '';
    }
    if (value === NEW_CATEGORY_VALUE) {
      return 'Nouvelle catégorie…';
    }
    return this.categories().find((candidate) => candidate.id === value)?.name ?? '';
  };

  protected readonly parseIsoDate = parseIsoDate;
  protected readonly draftDate = computed(() => parseIsoDate(this.draft().date));

  /** Display format while the field isn't focused — matches the read-only row's own format. */
  protected readonly formatDraftDate = computed(() => {
    const format = this.dateFormat();
    return (date: Date): string => formatDate(date, format);
  });

  /** Typing/edit format matches the display format — no surprise reformat on focus. */
  protected readonly parseInputDate = (value: string): Date | null =>
    parseFormattedDate(value, this.dateFormat());

  constructor() {
    // The form is created when editing starts, so its first render is the
    // only moment the requested field exists to be focused — a later read of
    // `focusField` would fight the user's own focus.
    afterNextRender(() => this.focusRequestedField());
  }

  /**
   * Marks every field touched and, if the draft holds up, emits it. `submit()`
   * is the only thing that marks the tree touched — no field is bound through
   * `[formField]` — so `touched()` reads as "a save was attempted", which is
   * the moment the inline errors are allowed to appear.
   */
  protected async attemptSave(): Promise<void> {
    await submit(this.fields, {
      action: async () => {
        const amount = parseAmount(this.draft().amount);
        if (amount !== null) {
          this.saved.emit(amount);
        }
      },
      onInvalid: () => {
        if (this.fields.amount().invalid()) {
          this.amountRejected.emit();
        }
      },
    });
  }

  private messageOf(field: FieldTree<string>): string | null {
    const state = field();
    return state.touched() && state.invalid() ? (state.errors()[0]?.message ?? null) : null;
  }

  protected onDateChange(date: Date | null): void {
    if (date === null) {
      return;
    }
    this.patch({ date: toIsoDate(date) });
  }

  private focusRequestedField(): void {
    switch (this.focusField()) {
      case 'date':
        this.dateField().nativeElement.querySelector('input')?.focus();
        return;
      case 'category':
        this.categoryField().nativeElement.querySelector('button')?.focus();
        return;
      case 'amount':
        this.focusAndSelect(this.amountField().nativeElement);
        return;
      default:
        this.focusAndSelect(this.labelField().nativeElement);
    }
  }

  /** Text fields open with their content selected, so typing replaces it. */
  private focusAndSelect(field: HTMLInputElement): void {
    field.focus();
    field.select();
  }

  protected onCategoryChange(value: number | typeof NEW_CATEGORY_VALUE | null | undefined): void {
    if (value === NEW_CATEGORY_VALUE) {
      // The option is a trigger, not a value. `categoryValue` is already
      // bound back to the draft's own id, but `hlm-select`'s internal
      // selection is a `model()` that a same-value template write can't
      // dirty-check its way past — writing it back directly is what
      // actually reverts the trigger, so cancelling the modal that opens
      // doesn't leave it showing a non-category.
      this.categorySelect().writeValue(this.draft().categoryId);
      this.categoryCreateRequested.emit();
      return;
    }
    this.patch({ categoryId: value ?? null });
  }

  /** Rewrites the amount's sign, which is all the debit/credit selector is. */
  protected setDebit(debit: boolean): void {
    const magnitude = this.draft().amount.trim().replace(/^-/, '');
    this.patch({ amount: debit ? `-${magnitude}` : magnitude });
  }

  protected patch(changes: Partial<EntryDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }));
  }
}
