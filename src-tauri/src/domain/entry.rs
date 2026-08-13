//! Register entries (_écritures_). `03-accounts.md` reduced this module to
//! the opening-balance system entry each account carries and the reads that
//! turn an account's entries into a balance and a last-activity date;
//! `06-entries.md` is the spec that grows it into the full entity —
//! creation, editing, deletion, listing, and reconciliation.

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::domain::date::IsoDate;
use crate::domain::money::InvalidAmount;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EntryKind {
    Debit,
    Credit,
}

impl EntryKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            EntryKind::Debit => "DEBIT",
            EntryKind::Credit => "CREDIT",
        }
    }

    pub fn parse(value: &str) -> Result<Self, EntryError> {
        match value {
            "DEBIT" => Ok(EntryKind::Debit),
            "CREDIT" => Ok(EntryKind::Credit),
            other => Err(EntryError::InvalidStoredValue(format!(
                "unknown entry type: {other}"
            ))),
        }
    }
}

/// An amount an account's balance moves by, split into the sign-carrying
/// [`EntryKind`] and the positive magnitude stored in `entries.amount`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SignedCents {
    pub kind: EntryKind,
    pub amount: i64,
}

impl SignedCents {
    pub fn new(cents: i64) -> Self {
        Self {
            kind: if cents < 0 {
                EntryKind::Debit
            } else {
                EntryKind::Credit
            },
            amount: cents.abs(),
        }
    }

    pub fn to_cents(self) -> i64 {
        match self.kind {
            EntryKind::Debit => -self.amount,
            EntryKind::Credit => self.amount,
        }
    }
}

/// An account's balance: the signed sum of its entries, in cents.
pub fn balance(amounts: impl IntoIterator<Item = SignedCents>) -> i64 {
    amounts.into_iter().map(SignedCents::to_cents).sum()
}

/// The mutable half of an account's system entry — the two fields an
/// opening-balance change moves, alongside the account row itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SystemEntry {
    pub date: IsoDate,
    pub amount: SignedCents,
}

/// A register entry as read back from storage — the system entry and every
/// real, user-entered one share this shape; `is_system` is what tells them
/// apart at the call site.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub id: i64,
    pub account_id: i64,
    pub label: String,
    pub category_id: Option<i64>,
    pub date: IsoDate,
    pub amount: SignedCents,
    pub description: String,
    pub is_system: bool,
    pub reconciled: bool,
}

/// The fields a user supplies when creating or editing a real entry — the
/// system entry is never written through this shape; it stays funneled
/// through `SystemEntry`/`infra::entry`'s free functions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntryDetails {
    pub label: String,
    pub category_id: Option<i64>,
    pub date: IsoDate,
    pub amount: SignedCents,
    pub description: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortDirection {
    Asc,
    Desc,
}

/// The parameters behind one page of `list_by_account`: an optional
/// inclusive date range (the system entry is always included regardless),
/// a sort direction (ties broken by `id` for stability), and an
/// offset/limit pair.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntryListQuery {
    pub from: Option<IsoDate>,
    pub to: Option<IsoDate>,
    pub sort: SortDirection,
    pub offset: i64,
    pub limit: i64,
}

/// One page of entries, plus whether another page follows — cheaper than a
/// `COUNT(*)` on every page, and all the CDK Virtual Scroll frontend needs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntryPage {
    pub entries: Vec<Entry>,
    pub has_more: bool,
}

#[derive(Debug, Error, Serialize, PartialEq, Eq, Clone)]
#[serde(tag = "kind", content = "message")]
pub enum EntryError {
    #[error("no such entry")]
    NotFound,
    #[error("the system entry cannot be modified directly")]
    SystemEntryReadOnly,
    #[error("an entry label cannot be empty")]
    EmptyLabel,
    #[error("unknown category")]
    UnknownCategory,
    #[error("invalid amount: {0}")]
    InvalidAmount(String),
    #[error("a stored entry value is invalid: {0}")]
    InvalidStoredValue(String),
    #[error("a filesystem or database error occurred: {0}")]
    Io(String),
}

impl From<InvalidAmount> for EntryError {
    fn from(error: InvalidAmount) -> Self {
        EntryError::InvalidAmount(error.to_string())
    }
}

/// Reads and writes over an account's entries — the full set `06-entries.md`
/// needs: creation, editing, deletion, paginated/filtered/sorted listing, and
/// reconciliation, alongside the narrower read set `03-accounts.md` and
/// `04-categories.md` already depend on.
///
/// Three deliberate departures from the method set `03-accounts.md` sketches,
/// so the specs building on this know they're decisions and not drift:
///
/// - The spec's `insert_system_entry`/`update_system_entry_date_and_amount`
///   are *not* on this trait. Both have to be written in the same transaction
///   as the account row, and both repositories share one connection, so a use
///   case holding a transaction across the two is impossible. They live in
///   `infra::entry` as free functions over a `&Connection`, called from
///   `AccountRepository`'s atomic create/update/delete.
/// - `exists_non_system_before` is named `exists_non_system_on_or_before`
///   here: the guard it backs also rejects an opening date landing *on* the
///   first real entry, which the shorter name reads as excluding.
/// - `last_entry_date` is added — the home screen's cards show each account's
///   last-activity date, which nothing in the sketched set provides.
///
/// Every method here only ever touches real entries in its write paths — the
/// system entry stays reachable through `find`/`list_by_account`'s reads (so
/// the register shows it) but rejects `update`/`delete`/`set_reconciled`
/// (enforced both here, defensively, and — the path actually exercised — in
/// `usecases::entry` before a write is ever attempted).
pub trait EntryRepository {
    /// Signed sum of the account's entries, in cents: its current balance.
    fn sum_by_account(&self, account_id: i64) -> Result<i64, EntryError>;

    /// Date of the account's most recent entry, system entry included — so
    /// an account with no activity yet reports its opening date rather than
    /// nothing.
    fn last_entry_date(&self, account_id: i64) -> Result<Option<IsoDate>, EntryError>;

    /// Whether any non-system entry falls on or before `date`. Backs the
    /// invariant that an account's opening date stays strictly before its
    /// first real entry.
    fn exists_non_system_on_or_before(
        &self,
        account_id: i64,
        date: &IsoDate,
    ) -> Result<bool, EntryError>;

    /// How much real activity the account has beyond its opening balance.
    fn count_non_system_by_account(&self, account_id: i64) -> Result<i64, EntryError>;

    /// How many entries are tagged with `category_id`. Backs the guard that
    /// stops a category being deleted out from under the entries using it,
    /// and the usage count each category is listed with.
    fn count_by_category(&self, category_id: i64) -> Result<i64, EntryError>;

    /// One page of an account's entries — the system entry is always
    /// included, regardless of `query`'s date range.
    fn list_by_account(
        &self,
        account_id: i64,
        query: &EntryListQuery,
    ) -> Result<EntryPage, EntryError>;

    /// The offset of the page containing the first entry at or before
    /// `target` in the given sort order, under the same date-range filter
    /// `list_by_account` would apply — what jump-to-date scrolls the
    /// frontend's virtual list to.
    #[allow(clippy::too_many_arguments)]
    fn offset_for_date(
        &self,
        account_id: i64,
        from: Option<&IsoDate>,
        to: Option<&IsoDate>,
        sort: SortDirection,
        target: &IsoDate,
    ) -> Result<i64, EntryError>;

    /// A single entry by id, system entry included — backs the edit-in-place
    /// load and every write path's system-entry guard.
    fn find(&self, id: i64) -> Result<Option<Entry>, EntryError>;

    /// Inserts a new real entry. `category_id` pointing at an unknown
    /// category surfaces as [`EntryError::UnknownCategory`] via the table's
    /// foreign key, rather than a redundant existence check here.
    fn create(&self, account_id: i64, details: &EntryDetails) -> Result<Entry, EntryError>;

    /// Rewrites every editable field of a real entry. Rejects the system
    /// entry with [`EntryError::SystemEntryReadOnly`].
    fn update(&self, id: i64, details: &EntryDetails) -> Result<Entry, EntryError>;

    /// Deletes a real entry outright — no soft-delete. Rejects the system
    /// entry with [`EntryError::SystemEntryReadOnly`].
    fn delete(&self, id: i64) -> Result<(), EntryError>;

    /// Toggles a real entry's reconciled flag without touching the rest of
    /// its fields. Rejects the system entry with
    /// [`EntryError::SystemEntryReadOnly`].
    fn set_reconciled(&self, id: i64, reconciled: bool) -> Result<Entry, EntryError>;
}

pub type DynEntryRepository = Box<dyn EntryRepository + Send + Sync>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_negative_amount_is_a_debit_and_a_positive_one_a_credit() {
        assert_eq!(SignedCents::new(-2_500).kind, EntryKind::Debit);
        assert_eq!(SignedCents::new(2_500).kind, EntryKind::Credit);
    }

    #[test]
    fn a_zero_amount_is_a_credit() {
        assert_eq!(SignedCents::new(0).kind, EntryKind::Credit);
    }

    #[test]
    fn the_stored_amount_is_always_positive() {
        assert_eq!(SignedCents::new(-2_500).amount, 2_500);
        assert_eq!(SignedCents::new(2_500).amount, 2_500);
    }

    #[test]
    fn signing_round_trips() {
        for cents in [0, 1, -1, 123_456, -123_456] {
            assert_eq!(SignedCents::new(cents).to_cents(), cents);
        }
    }

    #[test]
    fn a_balance_is_the_signed_sum_of_entries() {
        let entries = [
            SignedCents::new(100_000), // opening balance
            SignedCents::new(-2_550),
            SignedCents::new(-1_000),
            SignedCents::new(3_000),
        ];

        assert_eq!(balance(entries), 99_450);
    }

    #[test]
    fn an_account_with_no_entries_has_a_zero_balance() {
        assert_eq!(balance([]), 0);
    }

    #[test]
    fn entry_kind_round_trips_through_its_stored_value() {
        for kind in [EntryKind::Debit, EntryKind::Credit] {
            assert_eq!(EntryKind::parse(kind.as_str()).unwrap(), kind);
        }
        assert!(EntryKind::parse("TRANSFER").is_err());
    }
}
