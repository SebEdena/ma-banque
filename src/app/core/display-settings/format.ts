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

const DATE_PATTERNS: Record<DateFormat, RegExp> = {
  YMD: /^(\d{4})-(\d{2})-(\d{2})$/,
  MDY: /^(\d{2})\/(\d{2})\/(\d{4})$/,
  DMY: /^(\d{2})\/(\d{2})\/(\d{4})$/,
};

/**
 * The inverse of `formatDate`: parses text typed in one of the three
 * date-format presets. Returns `null` for text that doesn't match the
 * format's shape, or that rolls over into a different date (e.g. 31/02).
 */
export function parseFormattedDate(value: string, format: DateFormat): Date | null {
  const match = DATE_PATTERNS[format].exec(value.trim());
  if (!match) {
    return null;
  }

  const [, first, second, third] = match;
  const [year, month, day] =
    format === 'YMD'
      ? [Number(first), Number(second), Number(third)]
      : format === 'MDY'
        ? [Number(third), Number(first), Number(second)]
        : [Number(third), Number(second), Number(first)];

  const date = new Date(year, month - 1, day);
  const isValid =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return isValid ? date : null;
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
