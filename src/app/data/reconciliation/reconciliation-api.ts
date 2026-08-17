import { Service } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

/**
 * Mirrors `ReconciliationSummaryView` in
 * `src-tauri/src/commands/reconciliation.rs` — snake_case on the wire, like
 * `Entry` and `Account`. Every amount arrives as **signed major units** (Rust
 * already divided the cents, see `technical-architecture.md` §1.3): never
 * divide or multiply here.
 *
 * The three optional figures are `null` for distinct, meaningful reasons:
 * `statement_date` until the user sets one, `reconciled_balance` while there
 * is no statement date to sum up to, and `delta` while either balance is
 * missing. None of them defaults to zero — the panel prompts instead.
 */
export interface ReconciliationSummary {
  /** ISO `YYYY-MM-DD`, or `null` until the user sets a statement cut-off. */
  statement_date: string | null;
  bank_balance: number | null;
  reconciled_balance: number | null;
  /** `bank_balance - reconciled_balance`: positive means the bank holds more. */
  delta: number | null;
  is_balanced: boolean;
  unreconciled_count: number;
}

/**
 * Wraps `invoke()` for the reconciliation Tauri commands so components never
 * call `invoke()` directly — the seam this feature's tests mock, matching
 * `EntriesApi` and `AccountsApi`.
 *
 * All three commands answer with the freshly recomputed summary, so a field
 * edit and the figures it changes arrive together.
 */
@Service()
export class ReconciliationApi {
  summary(accountId: number): Promise<ReconciliationSummary> {
    return invoke<ReconciliationSummary>('reconciliation_summary', { accountId });
  }

  /** `amount` is the major-unit value as typed; Rust owns the rounding to cents. */
  setBankBalance(accountId: number, amount: number): Promise<ReconciliationSummary> {
    return invoke<ReconciliationSummary>('set_bank_balance', { accountId, amount });
  }

  setStatementDate(accountId: number, date: string): Promise<ReconciliationSummary> {
    return invoke<ReconciliationSummary>('set_statement_date', { accountId, date });
  }
}

/**
 * What the bank-balance field says when its text isn't a number at all — the
 * same wording `money::to_cents`' rejection gets, so both paths read
 * identically to the user.
 */
export const RECONCILIATION_INVALID_AMOUNT_MESSAGE = 'le solde du relevé est invalide';

/**
 * The `kind` discriminants `ReconciliationError` serializes to (see
 * `src-tauri/src/domain/reconciliation.rs`'s `#[serde(tag = "kind", content =
 * "message")]`).
 */
type ReconciliationErrorKind = 'UnknownAccount' | 'InvalidAmount' | 'InvalidDate' | 'Io';

interface ReconciliationErrorWire {
  kind: ReconciliationErrorKind;
  message?: string;
}

function isReconciliationErrorWire(error: unknown): error is ReconciliationErrorWire {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    typeof (error as { kind: unknown }).kind === 'string'
  );
}

/**
 * Turns a rejected `ReconciliationError` into the toast text to show,
 * matching `parseEntryError`/`parseAccountError` — the backend stays English
 * and the UI owns its own wording.
 */
export function parseReconciliationError(error: unknown): string {
  if (!isReconciliationErrorWire(error)) {
    return "une erreur inattendue s'est produite";
  }

  switch (error.kind) {
    case 'UnknownAccount':
      return "ce compte n'existe plus";
    case 'InvalidAmount':
      return RECONCILIATION_INVALID_AMOUNT_MESSAGE;
    case 'InvalidDate':
      return 'la date du relevé est invalide';
    case 'Io':
      return error.message ?? 'une erreur du système de fichiers est survenue';
    default:
      return "une erreur inattendue s'est produite";
  }
}
