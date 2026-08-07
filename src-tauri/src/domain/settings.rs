//! Display settings: the date/currency format presets a user picks in the
//! Settings screen's "Affichage" tab (see `docs/spec/05-settings-remainder.md`).
//! Stored as enum-like string values, not freeform pattern strings. Theme is
//! deliberately not here — it stays a frontend-only preference.

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DateFormat {
    /// `JJ/MM/AAAA`
    Dmy,
    /// `AAAA-MM-JJ`
    Ymd,
    /// `MM/JJ/AAAA`
    Mdy,
}

impl DateFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            DateFormat::Dmy => "DMY",
            DateFormat::Ymd => "YMD",
            DateFormat::Mdy => "MDY",
        }
    }

    pub fn parse(value: &str) -> Result<Self, SettingsError> {
        match value {
            "DMY" => Ok(DateFormat::Dmy),
            "YMD" => Ok(DateFormat::Ymd),
            "MDY" => Ok(DateFormat::Mdy),
            other => Err(SettingsError::InvalidStoredValue(format!(
                "unknown date_format value: {other}"
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CurrencyFormat {
    /// `1 234,56 €`
    SymbolAfter,
    /// `€ 1 234,56`
    SymbolBefore,
    /// `1 234,56 EUR`
    IsoCode,
}

impl CurrencyFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            CurrencyFormat::SymbolAfter => "SYMBOL_AFTER",
            CurrencyFormat::SymbolBefore => "SYMBOL_BEFORE",
            CurrencyFormat::IsoCode => "ISO_CODE",
        }
    }

    pub fn parse(value: &str) -> Result<Self, SettingsError> {
        match value {
            "SYMBOL_AFTER" => Ok(CurrencyFormat::SymbolAfter),
            "SYMBOL_BEFORE" => Ok(CurrencyFormat::SymbolBefore),
            "ISO_CODE" => Ok(CurrencyFormat::IsoCode),
            other => Err(SettingsError::InvalidStoredValue(format!(
                "unknown currency_format value: {other}"
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct DisplaySettings {
    pub date_format: DateFormat,
    pub currency_format: CurrencyFormat,
}

#[derive(Debug, Error, Serialize, PartialEq, Eq, Clone)]
#[serde(tag = "kind", content = "message")]
pub enum SettingsError {
    #[error("a stored settings value is invalid: {0}")]
    InvalidStoredValue(String),
    #[error("a filesystem or database error occurred: {0}")]
    Io(String),
}

/// Reads/writes the user's display-settings preferences.
pub trait SettingsRepository {
    fn get_display_settings(&self) -> Result<DisplaySettings, SettingsError>;
    fn update_display_settings(&self, settings: DisplaySettings) -> Result<(), SettingsError>;
}

/// A `SettingsRepository` behind a trait object, boxed so it can be
/// registered as Tauri-managed state without commands ever needing to name
/// the concrete (infra-layer) implementation. `Send + Sync` are required by
/// `tauri::State` — Tauri commands may run on different threads, so managed
/// state must be safely shareable across them.
pub type DynSettingsRepository = Box<dyn SettingsRepository + Send + Sync>;
