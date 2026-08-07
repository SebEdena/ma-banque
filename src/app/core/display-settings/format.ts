import type { CurrencyFormat, DateFormat } from './display-settings.types';

/** Formats `date` per one of the three fixed date-format presets. */
export function formatDate(date: Date, format: DateFormat): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());

  switch (format) {
    case 'YMD':
      return `${year}-${month}-${day}`;
    case 'MDY':
      return `${month}/${day}/${year}`;
    case 'DMY':
      return `${day}/${month}/${year}`;
  }
}

/**
 * Formats an already-decimal `amount` (e.g. `1234.56`, as Rust returns it —
 * see `technical-architecture.md` §1.3) per one of the three fixed
 * currency-format presets. Never divides by 100 or otherwise touches
 * cents — that conversion already happened in Rust.
 */
export function formatAmount(amount: number, format: CurrencyFormat): string {
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  switch (format) {
    case 'SYMBOL_BEFORE':
      return `€ ${formatted}`;
    case 'ISO_CODE':
      return `${formatted} EUR`;
    case 'SYMBOL_AFTER':
      return `${formatted} €`;
  }
}
