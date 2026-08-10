import { Service } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

/**
 * Mirrors `AccountView` in `src-tauri/src/commands/account.rs` — snake_case
 * on the wire, like `DisplaySettings`. `opening_balance` and `balance` arrive
 * as **major units** (Rust already divided the cents, see
 * `technical-architecture.md` §1.3): never divide or multiply them here.
 * Dates are ISO `YYYY-MM-DD` strings.
 */
export interface Account {
  id: number;
  name: string;
  color: string;
  icon: string;
  created_date: string;
  opening_balance: number;
  balance: number;
  archived: boolean;
  last_entry_date: string | null;
}

/** The account settings modal's form, as `create_account`/`update_account` take it. */
export interface AccountInput {
  name: string;
  color: string;
  icon: string;
  created_date: string;
  /** Major units, exactly as typed — Rust owns the rounding to cents. */
  opening_balance: number;
}

/**
 * Wraps `invoke()` for the account Tauri commands so components never call
 * `invoke()` directly — the seam this feature's tests mock, matching
 * `SettingsApi`.
 */
@Service()
export class AccountsApi {
  listActiveAccounts(): Promise<Account[]> {
    return invoke<Account[]>('list_active_accounts');
  }

  listArchivedAccounts(): Promise<Account[]> {
    return invoke<Account[]>('list_archived_accounts');
  }

  archiveAccount(id: number): Promise<void> {
    return invoke<void>('archive_account', { id });
  }
}

/**
 * The `kind` discriminants `AccountError` serializes to (see
 * `src-tauri/src/domain/account.rs`'s `#[serde(tag = "kind", content =
 * "message")]`).
 */
type AccountErrorKind =
  | 'NotFound'
  | 'EmptyName'
  | 'OpeningDateNotBeforeFirstEntry'
  | 'HasNonSystemEntries'
  | 'InvalidAmount'
  | 'InvalidDate'
  | 'Io';

interface AccountErrorWire {
  kind: AccountErrorKind;
  message?: string;
}

function isAccountErrorWire(error: unknown): error is AccountErrorWire {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    typeof (error as { kind: unknown }).kind === 'string'
  );
}

/**
 * Turns a rejected `AccountError` into the toast text to show. The French
 * lives here rather than in the Rust enum's messages, matching
 * `parseSettingsError` — the backend stays English and the UI owns its own
 * wording.
 */
export function parseAccountError(error: unknown): string {
  if (!isAccountErrorWire(error)) {
    return "une erreur inattendue s'est produite";
  }

  switch (error.kind) {
    case 'NotFound':
      return "ce compte n'existe plus";
    case 'EmptyName':
      return 'le nom du compte ne peut pas être vide';
    case 'OpeningDateNotBeforeFirstEntry':
      return "la date d'ouverture doit précéder la première écriture du compte";
    case 'HasNonSystemEntries':
      return 'ce compte contient des écritures et ne peut pas être supprimé';
    case 'InvalidAmount':
      return 'le solde initial est invalide';
    case 'InvalidDate':
      return "la date d'ouverture est invalide";
    case 'Io':
      return error.message ?? 'une erreur du système de fichiers est survenue';
    default:
      return "une erreur inattendue s'est produite";
  }
}

/**
 * Turns a backend ISO `YYYY-MM-DD` string into a `Date` at **local**
 * midnight. `new Date('2026-01-15')` would parse as UTC midnight and render
 * as the day before in any negative-offset timezone; `formatDate` reads local
 * date parts, so the two have to agree.
 */
export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
