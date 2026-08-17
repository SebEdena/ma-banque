import { Service } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

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
