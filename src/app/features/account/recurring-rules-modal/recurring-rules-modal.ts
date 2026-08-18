import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendarClock, lucidePlus } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import type { CurrencyFormat, DateFormat } from '@core/display-settings/display-settings.types';
import { Category } from '@data/categories/categories-api';
import {
  EditScope,
  RecurringRule,
  RecurringRuleInput,
  RecurringRulesApi,
  parseRecurringError,
} from '@data/recurring-rules/recurring-rules-api';
import { ConfirmDialog } from '@shared/confirm-dialog/confirm-dialog';
import { ModalShell } from '@shared/modal-shell/modal-shell';
import {
  RecurringRuleForm,
  RuleDraft,
  draftOf,
  emptyDraft,
} from '../recurring-rule-form/recurring-rule-form';
import { RecurringRuleList } from '../recurring-rule-list/recurring-rule-list';

/**
 * The account's recurring rules, as a modal over its register (business
 * requirements §4.3's last bullet). A modal rather than a route because the
 * configuration belongs to the account behind it, and because every other
 * configuration surface in this app already is one.
 *
 * A thin business container: it owns loading, writing and deleting rules,
 * and the edit-scope decision (`changesTemplate`/`changesSchedule` below) —
 * nothing about rendering a rule or a form field. The list and the form are
 * `RecurringRuleList`/`RecurringRuleForm`, each presentational in the same
 * way `EntryRow`/`EntryForm` are for the register; this container just
 * decides which one is on screen (`editing`) and reacts to what they emit.
 * `RecurringRulesApi` is the seam its tests mock.
 */
@Component({
  selector: 'app-recurring-rules-modal',
  imports: [
    NgIcon,
    ModalShell,
    ConfirmDialog,
    RecurringRuleList,
    RecurringRuleForm,
    ...HlmButtonImports,
  ],
  templateUrl: './recurring-rules-modal.html',
  styleUrl: '../accent.css',
  providers: [provideIcons({ lucideCalendarClock, lucidePlus })],
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

  constructor() {
    // An effect rather than a constructor call: `accountId` is a required
    // input, and inputs aren't bound yet while the constructor runs.
    effect(() => {
      const accountId = this.accountId();
      void this.load(accountId);
    });
  }

  protected startCreate(): void {
    this.draft.set(emptyDraft());
    this.editing.set('new');
  }

  protected startEdit(rule: RecurringRule): void {
    this.draft.set(draftOf(rule));
    this.editing.set(rule);
  }

  protected backToList(): void {
    this.editing.set(null);
  }

  /**
   * What `RecurringRuleForm` emits once its own validation finds the draft
   * saveable. Creating writes straight away. Editing asks about scope only
   * when a template field changed and the schedule did not —
   * `usecases::recurring::update_rule` forces `ALL_FUTURE` whenever the
   * schedule changed, whatever scope it is sent, so asking would offer a
   * choice the backend won't honour (user story 21). A schedule change is
   * checked first for exactly that reason: it wins even over a template
   * field that also changed in the same save.
   */
  protected async onFormSaved(input: RecurringRuleInput): Promise<void> {
    const target = this.editing();
    if (target === null) {
      return;
    }

    if (target === 'new') {
      await this.create(input);
      return;
    }

    if (!changesSchedule(target, input) && changesTemplate(target, input)) {
      this.awaitingScope.set({ rule: target, input });
      return;
    }
    await this.update(target, input, 'ALL_FUTURE');
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

/**
 * Whether an edit touched the schedule — mirrors `current.schedule !=
 * details.schedule` in `usecases::recurring::update_rule`, the check that
 * decides server-side whether the requested scope is honoured at all.
 * Checked before `changesTemplate` in `onFormSaved` so a save that changes
 * both never asks about scope only to have the backend ignore the answer.
 */
function changesSchedule(rule: RecurringRule, input: RecurringRuleInput): boolean {
  return (
    input.frequency !== rule.frequency ||
    input.interval !== rule.interval ||
    input.start_date !== rule.start_date ||
    input.end_date !== rule.end_date
  );
}
