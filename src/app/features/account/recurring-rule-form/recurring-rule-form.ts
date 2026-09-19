import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { FieldTree, form, requiredError, schema, submit, validate } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import { Category } from '@data/categories/categories-api';
import {
  Frequency,
  RecurringRule,
  RecurringRuleInput,
} from '@data/recurring-rules/recurring-rules-api';
import {
  AmountInput,
  formatAmountInput,
  parseAmount,
  withDebitSign,
} from '@shared/amount-input/amount-input';
import { todayIso } from '@shared/iso-date/iso-date';
import { provideCatalogIcons } from '@shared/pickers/icon-catalog';
import { AMOUNT_INVALID_MESSAGE, LABEL_REQUIRED_MESSAGE } from '../entry-field-messages';
import { RowCategory, UNCATEGORIZED } from '../row-category';

/**
 * What the rule form edits. The template half mirrors `EntryDraft` field for
 * field — `amount` is the field's **raw text, sign included**, so the
 * débit/crédit selector stays a view over that sign rather than a second
 * piece of state. `interval` is text for the same reason: `type="number"`
 * reads a half-typed or non-numeric value back as `""`, which would make
 * "interval below 1" unreportable.
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

const FREQUENCIES: readonly { value: Frequency; label: string }[] = [
  { value: 'WEEKLY', label: 'Hebdomadaire' },
  { value: 'MONTHLY', label: 'Mensuelle' },
  { value: 'YEARLY', label: 'Annuelle' },
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
  imports: [NgIcon, AmountInput, ...HlmButtonImports],
  templateUrl: './recurring-rule-form.html',
  styleUrl: '../accent.css',
  providers: [provideCatalogIcons(), provideIcons({ lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringRuleForm {
  readonly draft = model.required<RuleDraft>();
  readonly categories = input.required<Category[]>();
  readonly saving = input(false);

  /** A save attempt on a valid draft, carrying its parsed wire payload. */
  readonly saved = output<RecurringRuleInput>();
  readonly cancelled = output<void>();

  private readonly fields = form(this.draft, ruleDraftSchema);

  protected readonly labelError = computed(() => this.messageOf(this.fields.label));
  protected readonly amountError = computed(() => this.messageOf(this.fields.amount));
  protected readonly intervalError = computed(() => this.messageOf(this.fields.interval));
  protected readonly endDateError = computed(() => this.messageOf(this.fields.endDate));

  protected readonly isDebit = computed(() => this.draft().amount.trim().startsWith('-'));
  protected readonly frequencies = FREQUENCIES;

  private readonly categoriesById = computed(
    () => new Map(this.categories().map((category) => [category.id, category])),
  );

  /** The swatch beside the poste select. */
  protected readonly draftSwatch = computed<RowCategory>(() => {
    const id = this.draft().categoryId;
    return (id === null ? undefined : this.categoriesById().get(id)) ?? UNCATEGORIZED;
  });

  protected patch(changes: Partial<RuleDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }));
  }

  /** Rewrites the amount's sign, which is all the débit/crédit selector is. */
  protected setDebit(debit: boolean): void {
    this.patch({ amount: withDebitSign(this.draft().amount, debit) });
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
