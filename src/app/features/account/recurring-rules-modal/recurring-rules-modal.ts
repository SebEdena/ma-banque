import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FieldTree, form, requiredError, schema, submit, validate } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCalendarClock,
  lucidePencil,
  lucidePlus,
  lucideTrash2,
  lucideX,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import { CurrencyFormatPipe } from '@core/display-settings/currency-format.pipe';
import { formatDate } from '@core/display-settings/format';
import type { CurrencyFormat, DateFormat } from '@core/display-settings/display-settings.types';
import { Category } from '@data/categories/categories-api';
import {
  EditScope,
  Frequency,
  RecurringRule,
  RecurringRuleInput,
  RecurringRulesApi,
  parseRecurringError,
} from '@data/recurring-rules/recurring-rules-api';
import { AmountInput, formatAmountInput, parseAmount } from '@shared/amount-input/amount-input';
import { ConfirmDialog } from '@shared/confirm-dialog/confirm-dialog';
import { parseIsoDate, todayIso } from '@shared/iso-date/iso-date';
import { ModalShell } from '@shared/modal-shell/modal-shell';
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
interface RuleDraft {
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

/**
 * The plain-language schedule a row shows. Singular and plural are separate
 * strings rather than an interval spliced into one template, because French
 * changes the article as well as the noun ("Tous les mois" / "Toutes les 3
 * semaines").
 */
function scheduleSummary(frequency: Frequency, interval: number): string {
  switch (frequency) {
    case 'WEEKLY':
      return interval === 1 ? 'Toutes les semaines' : `Toutes les ${interval} semaines`;
    case 'YEARLY':
      return interval === 1 ? 'Tous les ans' : `Tous les ${interval} ans`;
    default:
      return interval === 1 ? 'Tous les mois' : `Tous les ${interval} mois`;
  }
}

function emptyDraft(): RuleDraft {
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

function draftOf(rule: RecurringRule): RuleDraft {
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
 * The account's recurring rules, as a modal over its register (business
 * requirements §4.3's last bullet). A modal rather than a route because the
 * configuration belongs to the account behind it, and because every other
 * configuration surface in this app already is one.
 *
 * A container, unlike the account screen's other children: it owns the whole
 * feature — list, form, deletion and the scope question — so `Account` hosts
 * it with an `accountId` and nothing else to coordinate. `RecurringRulesApi`
 * is the seam its tests mock.
 *
 * One component in both of its states rather than two: the list and the form
 * are the same panel, and switching between them is `editing` changing, so
 * there is no second markup to keep in step.
 */
@Component({
  selector: 'app-recurring-rules-modal',
  imports: [
    NgIcon,
    ModalShell,
    ConfirmDialog,
    AmountInput,
    CurrencyFormatPipe,
    ...HlmButtonImports,
  ],
  templateUrl: './recurring-rules-modal.html',
  styleUrl: '../accent.css',
  providers: [
    provideCatalogIcons(),
    provideIcons({ lucideCalendarClock, lucidePencil, lucidePlus, lucideTrash2, lucideX }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringRulesModal {
  private readonly api = inject(RecurringRulesApi);

  readonly accountId = input.required<number>();
  readonly accountColor = input.required<string>();
  readonly categories = input.required<Category[]>();
  readonly dateFormat = input.required<DateFormat>();
  readonly currencyFormat = input.required<CurrencyFormat>();

  readonly closed = output<void>();

  protected readonly rules = signal<RecurringRule[]>([]);
  protected readonly saving = signal(false);

  /** The rule the form is open on, `'new'` while creating, `null` on the list. */
  protected readonly editing = signal<RecurringRule | 'new' | null>(null);
  protected readonly confirmingDelete = signal<RecurringRule | null>(null);

  /**
   * The input a template edit is waiting on a scope for. Holding the built
   * input rather than re-reading the draft after the dialog keeps "what is
   * being saved" fixed at the moment the user asked to save it.
   */
  protected readonly awaitingScope = signal<{
    rule: RecurringRule;
    input: RecurringRuleInput;
  } | null>(null);

  protected readonly draft = signal<RuleDraft>(emptyDraft());
  private readonly fields = form(this.draft, ruleDraftSchema);

  protected readonly labelError = computed(() => this.messageOf(this.fields.label));
  protected readonly amountError = computed(() => this.messageOf(this.fields.amount));
  protected readonly intervalError = computed(() => this.messageOf(this.fields.interval));
  protected readonly endDateError = computed(() => this.messageOf(this.fields.endDate));

  protected readonly isDebit = computed(() => this.draft().amount.trim().startsWith('-'));
  protected readonly frequencies = FREQUENCIES;
  protected readonly parseIsoDate = parseIsoDate;
  protected readonly scheduleSummary = scheduleSummary;

  private readonly categoriesById = computed(
    () => new Map(this.categories().map((category) => [category.id, category])),
  );

  /** The swatch beside the poste select, and the one on each list row. */
  protected readonly draftSwatch = computed(() => this.swatchOf(this.draft().categoryId));

  constructor() {
    // An effect rather than a constructor call: `accountId` is a required
    // input, and inputs aren't bound yet while the constructor runs.
    effect(() => {
      const accountId = this.accountId();
      void this.load(accountId);
    });
  }

  protected swatchOf(categoryId: number | null): RowCategory {
    return (
      (categoryId === null ? undefined : this.categoriesById().get(categoryId)) ?? UNCATEGORIZED
    );
  }

  /** The date range a row spells out beside its frequency. */
  protected dateRange(rule: RecurringRule): string {
    const format = this.dateFormat();
    const start = formatDate(parseIsoDate(rule.start_date), format);
    return rule.end_date === null
      ? `depuis le ${start}`
      : `du ${start} au ${formatDate(parseIsoDate(rule.end_date), format)}`;
  }

  protected startCreate(): void {
    this.openForm(emptyDraft(), 'new');
  }

  protected startEdit(rule: RecurringRule): void {
    this.openForm(draftOf(rule), rule);
  }

  /**
   * The field tree outlives any one form — it is built once over `draft` —
   * so opening a form has to clear the touched state a previous refused save
   * left behind, or the fresh form renders that form's errors. `reset()`
   * clears touched and dirty only; the value is the draft we just set.
   */
  private openForm(draft: RuleDraft, target: RecurringRule | 'new'): void {
    this.draft.set(draft);
    this.fields().reset();
    this.editing.set(target);
  }

  protected backToList(): void {
    this.editing.set(null);
  }

  protected patch(changes: Partial<RuleDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }));
  }

  /** Rewrites the amount's sign, which is all the débit/crédit selector is. */
  protected setDebit(debit: boolean): void {
    const magnitude = this.draft().amount.trim().replace(/^-/, '');
    this.patch({ amount: debit ? `-${magnitude}` : magnitude });
  }

  /**
   * Marks every field touched and, if the draft holds up, saves it. Creating
   * writes straight away; editing asks about scope first, but only when a
   * template field actually changed — a schedule change has no meaningful
   * answer to that question (user story 21).
   */
  protected async attemptSave(): Promise<void> {
    await submit(this.fields, {
      action: async () => {
        const target = this.editing();
        const input = this.buildInput();
        if (input === null || target === null) {
          return;
        }

        if (target === 'new') {
          await this.create(input);
          return;
        }

        if (changesTemplate(target, input)) {
          this.awaitingScope.set({ rule: target, input });
          return;
        }
        await this.update(target, input, 'ALL_FUTURE');
      },
    });
  }

  protected async applyScope(scope: EditScope): Promise<void> {
    const pending = this.awaitingScope();
    if (pending === null) {
      return;
    }

    this.awaitingScope.set(null);
    await this.update(pending.rule, pending.input, scope);
  }

  protected async confirmDelete(): Promise<void> {
    const rule = this.confirmingDelete();
    if (rule === null) {
      return;
    }

    this.confirmingDelete.set(null);
    try {
      await this.api.deleteRecurringRule(rule.id);
      await this.load();
    } catch (error) {
      toast.error(parseRecurringError(error));
    }
  }

  private async create(input: RecurringRuleInput): Promise<void> {
    await this.write(() => this.api.createRecurringRule(this.accountId(), input));
  }

  private async update(
    rule: RecurringRule,
    input: RecurringRuleInput,
    scope: EditScope,
  ): Promise<void> {
    await this.write(() => this.api.updateRecurringRule(rule.id, input, scope));
  }

  /**
   * Runs a write and, if it lands, returns to the list over a reloaded set.
   * A rejection is toasted and leaves the form open on what was typed — the
   * backend's own validation is the only thing that could have refused it,
   * and re-typing the whole rule to fix one field would be punitive.
   */
  private async write(call: () => Promise<RecurringRule>): Promise<void> {
    this.saving.set(true);
    try {
      await call();
      this.editing.set(null);
      await this.load();
    } catch (error) {
      toast.error(parseRecurringError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async load(accountId = this.accountId()): Promise<void> {
    try {
      this.rules.set(await this.api.listRecurringRules(accountId));
    } catch (error) {
      toast.error(parseRecurringError(error));
    }
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

/**
 * Whether an edit touched the entry template, which is the only kind of
 * change scope means anything for (user story 19 vs. 21). Compared against
 * the stored rule rather than tracked as the user types, so reverting a field
 * by hand correctly counts as no change at all.
 */
function changesTemplate(rule: RecurringRule, input: RecurringRuleInput): boolean {
  return (
    input.label !== rule.label ||
    input.category_id !== rule.category_id ||
    input.amount !== rule.amount ||
    input.description !== rule.description
  );
}
