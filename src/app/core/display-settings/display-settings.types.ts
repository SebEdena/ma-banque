/**
 * Mirrors `src-tauri/src/domain/settings.rs`'s `DateFormat`/`CurrencyFormat`/
 * `DisplaySettings` — enum-like string values, not freeform pattern
 * strings, matching the `#[serde(rename_all = "SCREAMING_SNAKE_CASE")]`
 * wire format.
 */
export type DateFormat = 'DMY' | 'YMD' | 'MDY';
export type CurrencyFormat = 'SYMBOL_AFTER' | 'SYMBOL_BEFORE' | 'ISO_CODE';

export interface DisplaySettings {
  date_format: DateFormat;
  currency_format: CurrencyFormat;
}
