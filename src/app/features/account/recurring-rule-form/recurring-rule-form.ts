import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FieldTree, form, requiredError, schema, submit, validate } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDatePickerImports } from '@spartan-ng/helm/date-picker';

import type { DateFormat } from '@core/display-settings/display-settings.types';
import { formatDate, parseFormattedDate } from '@core/display-settings/format';
import { Category } from '@data/categories/categories-api';
import {
  Frequency,
  RecurringRule,
  RecurringRuleInput,
} from '@data/recurring-rules/recurring-rules-api';
import {
  AmountInput,
  formatAmountInput,
  isDebitSelected,
  parseAmount,
  withDebitSign,
  withPendingSign,
} from '@shared/amount-input/amount-input';
import { parseIsoDate, todayIso, toIsoDate } from '@shared/iso-date/iso-date';
import { provideCatalogIcons } from '@shared/pickers/icon-catalog';
import { AMOUNT_INVALID_MESSAGE, LABEL_REQUIRED_MESSAGE } from '../entry-field-messages';
import { RowCategory, UNCATEGORIZED } from '../row-category';

/**
 * What the rule form edits. The template half mirrors `EntryDraft` field for
 * field — `amount` is the field's **raw text, sign included**, so the
 * débit/crédit selector stays a view over that sign rather than a second
 * piece of state. `interval` stays text too, even though it is rendered
 * through a native `type="number"` input: a number input still round-trips
 * `"0"` and negative values as themselves (it only ever blanks out a value
 * that isn't a number at all), so `parseInterval` can keep reporting
 * "interval below 1" from the same text `EntryDraft`'s other fields use.
 */
export interface RuleDraft {
  label: string;
  categoryId: number | null;
  amount: string;
  description: string;
  frequency: Frequency;
  interval: string;
  startDate: string;
  endDate: string;
}

const INTERVAL_INVALID_MESSAGE = 'Intervalle invalide : 1 au minimum';
const END_BEFORE_START_MESSAGE = 'La date de fin précède la date de début';

/**
 * What makes a draft saveable. The label and amount rules are `EntryForm`'s,
 * unchanged — money and required fields behave the same wherever they are
 * typed (user story 27) — and the two schedule rules are user story 26's,
 * checked here so a schedule that would produce nothing is refused as it is
 * entered rather than on the round trip.
 */
const ruleDraftSchema = schema<RuleDraft>((draft) => {
  validate(draft.label, ({ value }) =>
    value().trim() === '' ? requiredError({ message: LABEL_REQUIRED_MESSAGE }) : null,
  );
  validate(draft.amount, ({ value }) =>
    parseAmount(value()) === null
      ? { kind: 'unreadableAmount', message: AMOUNT_INVALID_MESSAGE }
      : null,
  );
  validate(draft.interval, ({ value }) =>
    parseInterval(value()) === null
      ? { kind: 'invalidInterval', message: INTERVAL_INVALID_MESSAGE }
      : null,
  );
  validate(draft.endDate, ({ value, valueOf }) =>
    value() !== '' && value() < valueOf(draft.startDate)
      ? { kind: 'endBeforeStart', message: END_BEFORE_START_MESSAGE }
      : null,
  );
});

/** The interval field's text as a whole number of periods, or `null`. */
function parseInterval(text: string): number | null {
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= 1 ? value : null;
}

/**
 * The frequency unit as it reads after the interval number — "Tous les 2
 * jours/mois/années", "Toutes les 2 semaines" — not the frequency's own
 * name, since the schedule row phrases the whole thing around "Tous les X
 * ...".
 */
const FREQUENCIES: readonly { value: Frequency; label: string }[] = [
  { value: 'DAILY', label: 'jours' },
  { value: 'WEEKLY', label: 'semaines' },
  { value: 'MONTHLY', label: 'mois' },
  { value: 'YEARLY', label: 'années' },
];

export function emptyDraft(): RuleDraft {
  return {
    label: '',
    categoryId: null,
    amount: '',
    description: '',
    frequency: 'MONTHLY',
    interval: '1',
    startDate: todayIso(),
    endDate: '',
  };
}

export function draftOf(rule: RecurringRule): RuleDraft {
  return {
    label: rule.label,
    categoryId: rule.category_id,
    amount: formatAmountInput(rule.amount),
    description: rule.description,
    frequency: rule.frequency,
    interval: String(rule.interval),
    startDate: rule.start_date,
    endDate: rule.end_date ?? '',
  };
}

/**
 * The recurring rule creation/edit form — `RecurringRulesModal`'s form-mode
 * view, one component for both a new rule and an existing one (`editing`
 * upstream is what tells them apart, not this component).
 *
 * Presentational: it edits the `draft` model and emits a save only once its
 * own validation (`ruleDraftSchema`) finds it valid, carrying the parsed
 * wire payload — the same split, and the same reasoning, as `EntryForm`'s
 * for the entry draft. What counts as saveable is therefore stated once,
 * here, rather than re-derived by whoever holds the draft.
 */
@Component({
  selector: 'app-recurring-rule-form',
  imports: [NgIcon, AmountInput, ...HlmButtonImports, ...HlmDatePickerImports],
  templateUrl: './recurring-rule-form.html',
  styleUrl: '../accent.css',
  providers: [provideCatalogIcons(), provideIcons({ lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringRuleForm {
  readonly draft = model.required<RuleDraft>();
  readonly categories = input.required<Category[]>();
  readonly saving = input(false);
  readonly dateFormat = input.required<DateFormat>();

  /** A save attempt on a valid draft, carrying its parsed wire payload. */
  readonly saved = output<RecurringRuleInput>();
  readonly cancelled = output<void>();

  private readonly fields = form(this.draft, ruleDraftSchema);

  protected readonly labelError = computed(() => this.messageOf(this.fields.label));
  protected readonly amountError = computed(() => this.messageOf(this.fields.amount));
  protected readonly intervalError = computed(() => this.messageOf(this.fields.interval));
  protected readonly endDateError = computed(() => this.messageOf(this.fields.endDate));

  /** See `EntryForm`'s own `pendingDebit` — same fallback, same reasoning. */
  private readonly pendingDebit = signal(false);

  protected readonly isDebit = computed(() =>
    isDebitSelected(this.draft().amount, this.pendingDebit()),
  );
  protected readonly frequencies = FREQUENCIES;

  /**
   * The schedule row's leading words — "Tous les"/"Toutes les" — matching
   * the frequency unit's gender the way `recurring-rule-list`'s
   * `scheduleSummary` does ("Toutes les 3 semaines" needs the feminine
   * article; every other unit is masculine).
   */
  protected readonly intervalPrefix = computed(() =>
    this.draft().frequency === 'WEEKLY' ? 'Toutes les' : 'Tous les',
  );

  private readonly categoriesById = computed(
    () => new Map(this.categories().map((category) => [category.id, category])),
  );

  /** The swatch beside the poste select. */
  protected readonly draftSwatch = computed<RowCategory>(() => {
    const id = this.draft().categoryId;
    return (id === null ? undefined : this.categoriesById().get(id)) ?? UNCATEGORIZED;
  });

  /**
   * The two schedule dates through `hlm-date-picker` — the same component
   * `EntryForm` uses for the entry date, wired the same way, so a rule's
   * dates pick up the calendar popover and the display-format round-trip
   * instead of the browser's own native date input and locale.
   */
  protected readonly startDate = computed(() => parseIsoDate(this.draft().startDate));
  protected readonly endDate = computed(() => {
    const endDate = this.draft().endDate;
    return endDate === '' ? undefined : parseIsoDate(endDate);
  });

  /** Display format while a date field isn't focused — matches the list row's own format. */
  protected readonly formatDraftDate = computed(() => {
    const format = this.dateFormat();
    return (date: Date): string => formatDate(date, format);
  });

  /** Typing/edit format matches the display format — no surprise reformat on focus. */
  protected readonly parseInputDate = (value: string): Date | null =>
    parseFormattedDate(value, this.dateFormat());

  protected patch(changes: Partial<RuleDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }));
  }

  /** Rewrites the amount's sign, which is all the débit/crédit selector is. */
  protected setDebit(debit: boolean): void {
    this.pendingDebit.set(debit);
    this.patch({ amount: withDebitSign(this.draft().amount, debit) });
  }

  /** See `EntryForm.onAmountInput` — same reasoning, same helper. */
  protected onAmountInput(value: string): void {
    this.patch({ amount: withPendingSign(this.draft().amount, value, this.pendingDebit()) });
  }

  protected onStartDateChange(date: Date | null): void {
    if (date === null) {
      return;
    }
    this.patch({ startDate: toIsoDate(date) });
  }

  protected onEndDateChange(date: Date | null): void {
    this.patch({ endDate: date === null ? '' : toIsoDate(date) });
  }

  /**
   * Marks every field touched and, if the draft holds up, emits its wire
   * payload. `submit()` is the only thing that marks the tree touched — no
   * field is bound through `[field]` — so `touched()` reads as "a save was
   * attempted", which is the moment the inline errors are allowed to appear.
   */
  protected async attemptSave(): Promise<void> {
    await submit(this.fields, {
      action: async () => {
        const input = this.buildInput();
        if (input !== null) {
          this.saved.emit(input);
        }
      },
    });
  }

  /** The draft as the wire payload, or `null` if the schema would have caught it. */
  private buildInput(): RecurringRuleInput | null {
    const draft = this.draft();
    const amount = parseAmount(draft.amount);
    const interval = parseInterval(draft.interval);
    if (amount === null || interval === null) {
      return null;
    }

    return {
      label: draft.label.trim(),
      category_id: draft.categoryId,
      amount,
      description: draft.description.trim(),
      frequency: draft.frequency,
      interval,
      start_date: draft.startDate,
      end_date: draft.endDate === '' ? null : draft.endDate,
    };
  }

  private messageOf(field: FieldTree<string>): string | null {
    const state = field();
    return state.touched() && state.invalid() ? (state.errors()[0]?.message ?? null) : null;
  }
}
