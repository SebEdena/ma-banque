import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FieldTree, form, requiredError, schema, submit, validate } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideX } from '@ng-icons/lucide';
import { HlmDatePickerImports } from '@spartan-ng/helm/date-picker';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { parseIsoDate, toIsoDate } from '@core/accounts-api/accounts-api';
import { Category } from '@core/categories-api/categories-api';
import type { DateFormat } from '@core/display-settings/display-settings.types';
import { formatDate } from '@core/display-settings/format';
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
 * The amount field's text as the signed major-unit number to send, or `null`
 * when it isn't a number — including when only the sign has been picked. What
 * `money::to_cents` would reject on the far side (sub-cent precision
 * especially) is left for it to reject, so both paths say the same thing.
 */
export function parseAmount(text: string): number | null {
  const raw = text.trim();
  const magnitude = raw.replace(/^-/, '');
  const value = Number(magnitude);
  if (magnitude === '' || !Number.isFinite(value)) {
    return null;
  }
  return raw.startsWith('-') ? -value : value;
}

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
 * button beside the field: the select is native precisely because a floating
 * panel would be clipped by the virtual-scroll viewport's overflow, and an
 * extra option keeps the affordance where the user is already looking.
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
  imports: [NgIcon, ...HlmDatePickerImports, ...HlmTooltipImports],
  templateUrl: './entry-form.html',
  styles: `
    :host {
      display: contents;
    }

    /*
      The label and description opt out of accent.css's focus ring. That one
      is an outset outline offset a further 2px, so on the topmost row — the
      creation row, or the first row under the list container's clipped top
      border — it is drawn outside the row and cut off. Same accent, same
      2px, painted inward so it can't reach past the field. Scoped here
      rather than added to the shared stylesheet: it's these two fields'
      position that needs it, not a flavour other controls should reach for.
    */
    [data-focus-inset]:focus-visible {
      border-color: var(--account-color);
      box-shadow: inset 0 0 0 2px var(--account-color);
    }

    /*
      The amount field is a number input for the browser's own number syntax,
      not for its spinners: the column is 90px of right-aligned monospace, and
      a pair of arrows would sit on top of the digits.
    */
    input[type='number'] {
      appearance: textfield;
    }

    input[type='number']::-webkit-inner-spin-button,
    input[type='number']::-webkit-outer-spin-button {
      margin: 0;
      appearance: none;
    }
  `,
  styleUrl: '../accent.css',
  providers: [provideCatalogIcons(), provideIcons({ lucideCheck, lucideX })],
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
  private readonly categoryField =
    viewChild.required<ElementRef<HTMLSelectElement>>('categoryField');
  private readonly labelField = viewChild.required<ElementRef<HTMLInputElement>>('labelField');
  private readonly amountField = viewChild.required<ElementRef<HTMLInputElement>>('amountField');

  protected readonly newCategoryValue = NEW_CATEGORY_VALUE;

  /** The draft as a validated field tree — see `entryDraftSchema`. */
  private readonly fields = form(this.draft, entryDraftSchema);

  protected readonly labelError = computed(() => this.messageOf(this.fields.label));
  protected readonly amountError = computed(() => this.messageOf(this.fields.amount));

  protected readonly isDebit = computed(() => this.draft().amount.trim().startsWith('-'));

  /** Whether the amount field currently has focus — see `amountDisplay`. */
  protected readonly amountEditing = signal(false);

  /**
   * What gets written into the amount input's `value`, held still while the
   * field has focus. `type="number"` blanks any DOM value write that isn't a
   * complete number, so echoing the draft back between keystrokes would erase
   * a leading `-` or a trailing decimal point as it was being typed.
   */
  protected readonly amountDisplay = signal('');

  /** The swatch shown next to the category select. */
  protected readonly categorySwatch = computed<RowCategory>(() => {
    const id = this.draft().categoryId;
    return (
      (id === null ? undefined : this.categories().find((candidate) => candidate.id === id)) ??
      UNCATEGORIZED
    );
  });

  protected readonly parseIsoDate = parseIsoDate;
  protected readonly draftDate = computed(() => parseIsoDate(this.draft().date));

  /** Display format while the field isn't focused — matches the read-only row's own format. */
  protected readonly formatDraftDate = computed(() => {
    const format = this.dateFormat();
    return (date: Date): string => formatDate(date, format);
  });

  /** Typing/edit format is always ISO — unambiguous regardless of `dateFormat`. */
  protected readonly formatInputIsoDate = (date: Date): string => toIsoDate(date);

  protected parseInputIsoDate(value: string): Date | null {
    const date = parseIsoDate(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  constructor() {
    // The form is created when editing starts, so its first render is the
    // only moment the requested field exists to be focused — a later read of
    // `focusField` would fight the user's own focus.
    afterNextRender(() => this.focusRequestedField());

    effect(() => {
      const amount = this.draft().amount;
      if (!this.amountEditing()) {
        this.amountDisplay.set(amount);
      }
    });
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
        this.categoryField().nativeElement.focus();
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

  protected setCategory(select: HTMLSelectElement): void {
    if (select.value === NEW_CATEGORY_VALUE) {
      // The option is a trigger, not a value: the field goes back to showing
      // what it did, so cancelling the modal doesn't leave it on a
      // non-category. A save moves it on through the draft.
      select.value = String(this.draft().categoryId ?? '');
      this.categoryCreateRequested.emit();
      return;
    }
    this.patch({ categoryId: select.value === '' ? null : Number(select.value) });
  }

  protected onAmountInput(field: HTMLInputElement): void {
    if (field.validity.badInput) {
      // A value in progress the browser refuses to hand over — a lone `-`, or
      // `12.` mid-decimal — reads back as empty. Taking it would drop the sign
      // the user just typed and flip the debit/credit selector under them.
      return;
    }

    const amount = this.withDebitSign(field.value);
    if (amount !== field.value) {
      field.value = amount;
    }
    this.patch({ amount });
  }

  /**
   * Carries a debit sign the field can't display over to the first magnitude
   * typed. `type="number"` has no way to render a lone `-`, so a row that
   * opens on one — or one where Débit was picked while the field was empty —
   * looks empty; without this the sign would be lost on the next keystroke.
   * Once the field holds a magnitude its text is the only source of the sign
   * again, so deleting the `-` still means crédit.
   */
  private withDebitSign(raw: string): string {
    const hasMagnitude = this.draft().amount.trim().replace(/^-/, '') !== '';
    return !hasMagnitude && this.isDebit() && raw !== '' && !raw.startsWith('-') ? `-${raw}` : raw;
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
