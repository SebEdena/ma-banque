import { Service } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

/**
 * Period preset: one of four fixed time windows for statistics queries.
 * Mirrors `PeriodPreset` in `src-tauri/src/domain/statistics.rs`.
 */
export type PeriodPreset = 'ONE_MONTH' | 'THREE_MONTHS' | 'SIX_MONTHS' | 'TWELVE_MONTHS';

/**
 * One bucket in the category-breakdown aggregate: a category and its share
 * of the period's expenses. `category_id` is `null` for the uncategorized
 * bucket ("Sans poste"). Mirrors `CategoryBreakdownBucket`.
 */
export interface CategoryBreakdownBucket {
  category_id: number | null;
  name: string;
  color: string;
  icon: string;
  amount: number; // in major units (dollars/euros), already converted from cents
  percentage: number;
}

/**
 * Category-breakdown aggregate response: the period's expense buckets and
 * the total expense for the period. Mirrors `CategoryBreakdownResponse`.
 */
export interface CategoryBreakdownResponse {
  buckets: CategoryBreakdownBucket[];
  total_expenses: number; // in major units
}

/**
 * One month's entry in the month-bucketed aggregate.
 * Mirrors `MonthBucket`.
 */
export interface MonthBucket {
  month: string; // "YYYY-MM" format
  income: number; // in major units, as positive magnitude
  expense: number; // in major units, as positive magnitude
}

/**
 * Month-bucketed aggregate response: one row per month in the period,
 * including months with zero activity. Mirrors `MonthBucketedResponse`.
 */
export interface MonthBucketedResponse {
  months: MonthBucket[];
}

/**
 * The `kind` discriminants `EntryError` serializes to when statistics commands fail.
 * Mirrors error handling from `src-tauri/src/domain/entry.rs`.
 */
type StatisticsErrorKind = 'NotFound' | 'InvalidStoredValue' | 'Io';

interface StatisticsErrorWire {
  kind: StatisticsErrorKind;
  message?: string;
}

function isStatisticsErrorWire(error: unknown): error is StatisticsErrorWire {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    typeof (error as { kind: unknown }).kind === 'string'
  );
}

/**
 * Turns a rejected statistics error into the toast text to show, matching
 * `parseEntryError`/`parseAccountError` — the backend stays English and
 * the UI owns its own wording.
 */
export function parseStatisticsError(error: unknown): string {
  if (!isStatisticsErrorWire(error)) {
    return "une erreur inattendue s'est produite";
  }

  switch (error.kind) {
    case 'NotFound':
      return "ce compte n'existe plus";
    case 'InvalidStoredValue':
      return 'les données du compte contiennent une valeur invalide';
    case 'Io':
      return error.message ?? 'une erreur du système de fichiers est survenue';
    default:
      return "une erreur inattendue s'est produite";
  }
}

/**
 * Wraps `invoke()` for the statistics Tauri commands so components never
 * call `invoke()` directly — the seam this feature's tests mock, matching
 * `AccountsApi` and `EntriesApi`.
 */
@Service()
export class StatisticsApi {
  categoryBreakdown(accountId: number, preset: PeriodPreset): Promise<CategoryBreakdownResponse> {
    return invoke<CategoryBreakdownResponse>('category_breakdown', {
      accountId,
      preset,
    });
  }

  monthBucketed(accountId: number, preset: PeriodPreset): Promise<MonthBucketedResponse> {
    return invoke<MonthBucketedResponse>('month_bucketed', {
      accountId,
      preset,
    });
  }
}
