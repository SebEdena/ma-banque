import { Service } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

/** The three frequencies §3.4 allows, as `Frequency` serializes them. */
export type Frequency = 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** How far an edit to a rule's template reaches, as `EditScope` parses it. */
export type EditScope = 'NEXT_OCCURRENCE_ONLY' | 'ALL_FUTURE';

/**
 * Mirrors `RecurringRuleView` in `src-tauri/src/commands/recurring.rs`. The
 * payload is **flat** — the entry template and the schedule side by side —
 * even though the Rust domain splits them, because that is the shape the
 * rule form edits. `amount` is signed major units (negative is a debit),
 * already divided by Rust; dates are ISO `YYYY-MM-DD`.
 */
export interface RecurringRule {
  id: number;
  account_id: number;
  label: string;
  category_id: number | null;
  amount: number;
  description: string;
  frequency: Frequency;
  interval: number;
  start_date: string;
  end_date: string | null;
}

/** Mirrors `RecurringRuleInputPayload` — the rule form as the commands take it. */
export type RecurringRuleInput = Omit<RecurringRule, 'id' | 'account_id'>;

/**
 * Wraps `invoke()` for the recurring-rule Tauri commands so components never
 * call `invoke()` directly — the seam this feature's tests mock, matching
 * `EntriesApi` and `AccountsApi`.
 *
 * Generation is never triggered by the user: `openAccount` runs when an
 * account screen loads and `generateAllDue` when the app starts, which is why
 * both live here rather than behind any control.
 */
@Service()
export class RecurringRulesApi {
  /**
   * Brings one account's register up to today, resolving with how many
   * entries that produced — the count the screen reports to the user.
   */
  openAccount(accountId: number): Promise<number> {
    return invoke<number>('open_account', { accountId });
  }

  /** The startup sweep, across every active account. */
  generateAllDue(): Promise<void> {
    return invoke<void>('generate_all_due_entries');
  }

  listRecurringRules(accountId: number): Promise<RecurringRule[]> {
    return invoke<RecurringRule[]>('list_recurring_rules', { accountId });
  }

  createRecurringRule(accountId: number, input: RecurringRuleInput): Promise<RecurringRule> {
    return invoke<RecurringRule>('create_recurring_rule', { accountId, input });
  }

  /**
   * `scope` is advisory: the backend forces `ALL_FUTURE` when the schedule
   * changed, whatever was sent (see `usecases::recurring::update_rule`). The
   * UI still only asks about it for template edits, since "apply this new
   * frequency to the next occurrence only" has no meaning.
   */
  updateRecurringRule(
    id: number,
    input: RecurringRuleInput,
    scope: EditScope,
  ): Promise<RecurringRule> {
    return invoke<RecurringRule>('update_recurring_rule', { id, input, scope });
  }

  deleteRecurringRule(id: number): Promise<void> {
    return invoke<void>('delete_recurring_rule', { id });
  }
}

/**
 * The `kind` discriminants `RecurringError` serializes to (see
 * `src-tauri/src/domain/recurring.rs`'s `#[serde(tag = "kind", content =
 * "message")]`).
 */
type RecurringErrorKind =
  | 'NotFound'
  | 'EmptyLabel'
  | 'InvalidInterval'
  | 'EndDateBeforeStartDate'
  | 'UnknownCategory'
  | 'InvalidAmount'
  | 'InvalidStoredValue'
  | 'Io';

interface RecurringErrorWire {
  kind: RecurringErrorKind;
  message?: string;
}

function isRecurringErrorWire(error: unknown): error is RecurringErrorWire {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    typeof (error as { kind: unknown }).kind === 'string'
  );
}

/**
 * Turns a rejected `RecurringError` into the toast text to show, matching
 * `parseEntryError`/`parseAccountError` — the backend stays English and the
 * UI owns its own wording.
 */
export function parseRecurringError(error: unknown): string {
  if (!isRecurringErrorWire(error)) {
    return "une erreur inattendue s'est produite";
  }

  switch (error.kind) {
    case 'NotFound':
      return "cette écriture périodique n'existe plus";
    case 'EmptyLabel':
      return "le libellé de l'écriture périodique ne peut pas être vide";
    case 'InvalidInterval':
      return "l'intervalle doit être d'au moins 1";
    case 'EndDateBeforeStartDate':
      return 'la date de fin ne peut pas précéder la date de début';
    case 'UnknownCategory':
      return "ce poste n'existe plus";
    case 'InvalidAmount':
      return "le montant de l'écriture périodique est invalide";
    case 'InvalidStoredValue':
      return "l'écriture périodique contient une valeur invalide";
    case 'Io':
      return error.message ?? 'une erreur du système de fichiers est survenue';
    default:
      return "une erreur inattendue s'est produite";
  }
}

/** The toast an account open raises when generation produced entries. */
export function generatedEntriesMessage(count: number): string {
  return count === 1 ? '1 écriture générée' : `${count} écritures générées`;
}
