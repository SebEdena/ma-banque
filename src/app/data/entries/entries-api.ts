import { Service } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

/**
 * Mirrors `EntryView` in `src-tauri/src/commands/entry.rs` — snake_case on
 * the wire, like `Account` and `Category`. `amount` arrives as **signed
 * major units** (negative is a debit, positive a credit; Rust already
 * divided the cents, see `technical-architecture.md` §1.3): never divide or
 * multiply it here. `date` is an ISO `YYYY-MM-DD` string.
 */
export interface Entry {
  id: number;
  account_id: number;
  label: string;
  category_id: number | null;
  date: string;
  amount: number;
  description: string;
  is_system: boolean;
  reconciled: boolean;
  /** Whether a recurring rule generated this entry — provenance only. */
  is_recurring: boolean;
}

/** `ORDER BY date` direction, as `ListEntriesPayload::sort` spells it. */
export type SortDirection = 'ASC' | 'DESC';

/** Mirrors `ListEntriesPayload` in `src-tauri/src/commands/entry.rs`. */
export interface ListEntriesQuery {
  /** Inclusive lower bound, or `null` for no lower bound. */
  from: string | null;
  /** Inclusive upper bound, or `null` for no upper bound. */
  to: string | null;
  /** Narrows the page to unticked entries; the system entry is exempt. */
  unreconciled_only: boolean;
  sort: SortDirection;
  page_size: number;
  offset: number;
  /**
   * When set, the backend resolves the offset itself so the returned page is
   * the one containing the first entry at or before this date — `offset` is
   * ignored. Unused by the entries screen, which keeps a buffer contiguous
   * from offset 0 (CDK Virtual Scroll renders one array, so a page starting
   * at an unreported offset can't be placed in it).
   */
  jump_to_date: string | null;
}

/** Mirrors `EntryPageView` — one page plus whether another follows. */
export interface EntryPage {
  entries: Entry[];
  has_more: boolean;
}

/**
 * Mirrors `EntryInputPayload` — the entry row's form as `create_entry` and
 * `update_entry` take it. `amount` is the **signed** major-unit value the
 * debit/credit sync already produced (negative is a debit), handed over
 * exactly as typed: Rust owns the rounding to cents.
 */
export interface EntryInput {
  label: string;
  category_id: number | null;
  date: string;
  amount: number;
  description: string;
}

/**
 * Wraps `invoke()` for the entry Tauri commands so components never call
 * `invoke()` directly — the seam this feature's tests mock, matching
 * `AccountsApi` and `CategoriesApi`.
 */
@Service()
export class EntriesApi {
  listEntries(accountId: number, query: ListEntriesQuery): Promise<EntryPage> {
    return invoke<EntryPage>('list_entries', { accountId, query });
  }

  createEntry(accountId: number, input: EntryInput): Promise<Entry> {
    return invoke<Entry>('create_entry', { accountId, input });
  }

  updateEntry(id: number, input: EntryInput): Promise<Entry> {
    return invoke<Entry>('update_entry', { id, input });
  }

  deleteEntry(id: number): Promise<void> {
    return invoke<void>('delete_entry', { id });
  }

  setReconciled(id: number, reconciled: boolean): Promise<Entry> {
    return invoke<Entry>('set_reconciled', { id, reconciled });
  }
}

/**
 * What the amount field says when its text isn't a number at all — the same
 * wording the backend's own `money::to_cents` rejection gets, so the two
 * paths read identically to the user.
 */
export const ENTRY_INVALID_AMOUNT_MESSAGE = "le montant de l'écriture est invalide";

/**
 * The `kind` discriminants `EntryError` serializes to (see
 * `src-tauri/src/domain/entry.rs`'s `#[serde(tag = "kind", content =
 * "message")]`). Exported so `StatisticsApi` — whose two commands also
 * return `Result<_, EntryError>` — can check against the real, complete set
 * of variants instead of a hand-forked subset
 * (`src/app/data/statistics/statistics-api.ts`).
 */
export type EntryErrorKind =
  | 'NotFound'
  | 'SystemEntryReadOnly'
  | 'EmptyLabel'
  | 'UnknownCategory'
  | 'InvalidAmount'
  | 'InvalidStoredValue'
  | 'Io';

interface EntryErrorWire {
  kind: EntryErrorKind;
  message?: string;
}

function isEntryErrorWire(error: unknown): error is EntryErrorWire {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    typeof (error as { kind: unknown }).kind === 'string'
  );
}

/**
 * Turns a rejected `EntryError` into the toast text to show, matching
 * `parseAccountError`/`parseCategoryError` — the backend stays English and
 * the UI owns its own wording.
 */
export function parseEntryError(error: unknown): string {
  if (!isEntryErrorWire(error)) {
    return "une erreur inattendue s'est produite";
  }

  switch (error.kind) {
    case 'NotFound':
      return "cette écriture n'existe plus";
    case 'SystemEntryReadOnly':
      return "l'écriture de solde initial se modifie depuis les paramètres du compte";
    case 'EmptyLabel':
      return "le libellé de l'écriture ne peut pas être vide";
    case 'UnknownCategory':
      return "ce poste n'existe plus";
    case 'InvalidAmount':
      return ENTRY_INVALID_AMOUNT_MESSAGE;
    case 'InvalidStoredValue':
      return "l'écriture contient une valeur invalide";
    case 'Io':
      return error.message ?? 'une erreur du système de fichiers est survenue';
    default:
      return "une erreur inattendue s'est produite";
  }
}
