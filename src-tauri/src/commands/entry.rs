//! Tauri commands exposing entries to Angular.
//!
//! This is where cents become the major-unit, signed number the UI displays
//! and edits — exactly the same boundary rule `commands::account` already
//! follows for the opening balance (technical-architecture.md §1.3).

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::domain::date::IsoDate;
use crate::domain::entry::DynEntryRepository;
use crate::domain::entry::{Entry, EntryError, EntryPage, SortDirection};
use crate::domain::money;
use crate::usecases::entry::{self as usecases, EntryInput, ListEntriesInput};

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct EntryView {
    pub id: i64,
    pub account_id: i64,
    pub label: String,
    pub category_id: Option<i64>,
    pub date: String,
    /// Major units, signed — negative is a debit, positive (including zero)
    /// a credit.
    pub amount: f64,
    pub description: String,
    pub is_system: bool,
    pub reconciled: bool,
}

impl From<Entry> for EntryView {
    fn from(entry: Entry) -> Self {
        Self {
            id: entry.id,
            account_id: entry.account_id,
            label: entry.label,
            category_id: entry.category_id,
            date: entry.date.to_string(),
            amount: money::to_major(entry.amount.to_cents()),
            description: entry.description,
            is_system: entry.is_system,
            reconciled: entry.reconciled,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct EntryPageView {
    pub entries: Vec<EntryView>,
    pub has_more: bool,
}

impl From<EntryPage> for EntryPageView {
    fn from(page: EntryPage) -> Self {
        Self {
            entries: page.entries.into_iter().map(EntryView::from).collect(),
            has_more: page.has_more,
        }
    }
}

/// The entry row's form, as it comes off the wire: `amount` is the signed
/// major-unit value the debit/credit↔amount sync already produced, and
/// `date` stays a raw string so a malformed date surfaces as an `EntryError`
/// rather than a deserialization failure Angular can't tell apart from the
/// others.
#[derive(Debug, Clone, Deserialize)]
pub struct EntryInputPayload {
    pub label: String,
    pub category_id: Option<i64>,
    pub date: String,
    pub amount: f64,
    pub description: String,
}

impl TryFrom<EntryInputPayload> for EntryInput {
    type Error = EntryError;

    fn try_from(payload: EntryInputPayload) -> Result<Self, Self::Error> {
        Ok(EntryInput {
            label: payload.label,
            category_id: payload.category_id,
            date: IsoDate::parse(&payload.date)
                .map_err(|e| EntryError::InvalidStoredValue(e.to_string()))?,
            amount: payload.amount,
            description: payload.description,
        })
    }
}

/// The entries screen's request: an optional inclusive date range, a sort
/// direction, a page size/offset, and an optional date to jump to.
#[derive(Debug, Clone, Deserialize)]
pub struct ListEntriesPayload {
    pub from: Option<String>,
    pub to: Option<String>,
    pub sort: String,
    pub page_size: i64,
    pub offset: i64,
    pub jump_to_date: Option<String>,
}

impl TryFrom<ListEntriesPayload> for ListEntriesInput {
    type Error = EntryError;

    fn try_from(payload: ListEntriesPayload) -> Result<Self, Self::Error> {
        let parse_date = |raw: &str| {
            IsoDate::parse(raw).map_err(|e| EntryError::InvalidStoredValue(e.to_string()))
        };

        Ok(ListEntriesInput {
            from: payload.from.as_deref().map(parse_date).transpose()?,
            to: payload.to.as_deref().map(parse_date).transpose()?,
            sort: match payload.sort.as_str() {
                "ASC" => SortDirection::Asc,
                "DESC" => SortDirection::Desc,
                other => {
                    return Err(EntryError::InvalidStoredValue(format!(
                        "unknown sort direction: {other}"
                    )))
                }
            },
            page_size: payload.page_size,
            offset: payload.offset,
            jump_to_date: payload
                .jump_to_date
                .as_deref()
                .map(parse_date)
                .transpose()?,
        })
    }
}

#[tauri::command]
pub fn list_entries(
    entries: State<DynEntryRepository>,
    account_id: i64,
    query: ListEntriesPayload,
) -> Result<EntryPageView, EntryError> {
    usecases::list_entries(&**entries, account_id, query.try_into()?).map(EntryPageView::from)
}

#[tauri::command]
pub fn create_entry(
    entries: State<DynEntryRepository>,
    account_id: i64,
    input: EntryInputPayload,
) -> Result<EntryView, EntryError> {
    usecases::create_entry(&**entries, account_id, input.try_into()?).map(EntryView::from)
}

#[tauri::command]
pub fn update_entry(
    entries: State<DynEntryRepository>,
    id: i64,
    input: EntryInputPayload,
) -> Result<EntryView, EntryError> {
    usecases::update_entry(&**entries, id, input.try_into()?).map(EntryView::from)
}

#[tauri::command]
pub fn delete_entry(entries: State<DynEntryRepository>, id: i64) -> Result<(), EntryError> {
    usecases::delete_entry(&**entries, id)
}

#[tauri::command]
pub fn set_reconciled(
    entries: State<DynEntryRepository>,
    id: i64,
    reconciled: bool,
) -> Result<EntryView, EntryError> {
    usecases::set_reconciled(&**entries, id, reconciled).map(EntryView::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::entry::SignedCents;

    fn entry(amount_cents: i64) -> Entry {
        Entry {
            id: 1,
            account_id: 7,
            label: "Courses".to_owned(),
            category_id: Some(3),
            date: IsoDate::parse("2026-02-01").unwrap(),
            amount: SignedCents::new(amount_cents),
            description: "au marché".to_owned(),
            is_system: false,
            reconciled: true,
        }
    }

    #[test]
    fn a_debit_crosses_the_boundary_as_a_negative_major_unit_amount() {
        let view = EntryView::from(entry(-2_550));

        assert_eq!(view.amount, -25.50);
    }

    #[test]
    fn a_credit_crosses_the_boundary_as_a_positive_major_unit_amount() {
        let view = EntryView::from(entry(2_550));

        assert_eq!(view.amount, 25.50);
    }

    #[test]
    fn every_field_crosses_the_boundary() {
        let view = EntryView::from(entry(100));

        assert_eq!(view.id, 1);
        assert_eq!(view.account_id, 7);
        assert_eq!(view.label, "Courses");
        assert_eq!(view.category_id, Some(3));
        assert_eq!(view.date, "2026-02-01");
        assert_eq!(view.description, "au marché");
        assert!(!view.is_system);
        assert!(view.reconciled);
    }

    #[test]
    fn a_malformed_entry_date_is_reported_as_an_entry_error() {
        let payload = EntryInputPayload {
            label: "Courses".to_owned(),
            category_id: None,
            date: "01/02/2026".to_owned(),
            amount: -25.50,
            description: String::new(),
        };

        let err = EntryInput::try_from(payload).unwrap_err();

        assert!(matches!(err, EntryError::InvalidStoredValue(_)));
    }

    #[test]
    fn an_unknown_sort_direction_is_reported_as_an_entry_error() {
        let payload = ListEntriesPayload {
            from: None,
            to: None,
            sort: "SIDEWAYS".to_owned(),
            page_size: 50,
            offset: 0,
            jump_to_date: None,
        };

        let err = ListEntriesInput::try_from(payload).unwrap_err();

        assert!(matches!(err, EntryError::InvalidStoredValue(_)));
    }
}
