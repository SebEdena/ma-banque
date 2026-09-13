//! Recurring rules (_règles de périodicité_, business requirements §3.4):
//! an entry-shaped template plus a schedule, per account.
//!
//! What a rule generates is an ordinary [`crate::domain::entry::Entry`] —
//! editable, deletable, with no link back to the rule surfaced in the
//! register. `entries.recurring_rule_id` is provenance for the generator's
//! own bookkeeping, not a relationship the register honours.
//!
//! [`occurrences_between`] is the heart of the module and the one place
//! that knows what a schedule means. It takes no repository, no rule id, and
//! no clock.

use serde::Serialize;
use thiserror::Error;

use crate::domain::account::AccountError;
use crate::domain::date::IsoDate;
use crate::domain::entry::SignedCents;
use crate::domain::money::InvalidAmount;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Frequency {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

impl Frequency {
    pub fn as_str(&self) -> &'static str {
        match self {
            Frequency::Daily => "DAILY",
            Frequency::Weekly => "WEEKLY",
            Frequency::Monthly => "MONTHLY",
            Frequency::Yearly => "YEARLY",
        }
    }

    pub fn parse(value: &str) -> Result<Self, RecurringError> {
        match value {
            "DAILY" => Ok(Frequency::Daily),
            "WEEKLY" => Ok(Frequency::Weekly),
            "MONTHLY" => Ok(Frequency::Monthly),
            "YEARLY" => Ok(Frequency::Yearly),
            other => Err(RecurringError::InvalidStoredValue(format!(
                "unknown frequency: {other}"
            ))),
        }
    }
}

/// The entry-shaped half of a rule: exactly the fields a generated entry
/// carries beyond its date. Same shape an [`OccurrenceOverride`] shadows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuleTemplate {
    pub label: String,
    pub category_id: Option<i64>,
    pub amount: SignedCents,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuleSchedule {
    pub frequency: Frequency,
    pub interval: u32,
    pub start_date: IsoDate,
    /// Absent for an open-ended commitment.
    pub end_date: Option<IsoDate>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecurringRule {
    pub id: i64,
    pub account_id: i64,
    pub template: RuleTemplate,
    pub schedule: RuleSchedule,
}

/// The two halves as supplied on save — the create/edit form's whole payload.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecurringRuleDetails {
    pub template: RuleTemplate,
    pub schedule: RuleSchedule,
}

/// A template shadowing its rule's for one occurrence only, written by the
/// `NextOccurrenceOnly` edit scope and consumed by the generator when it
/// reaches `occurrence_date`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OccurrenceOverride {
    pub rule_id: i64,
    pub occurrence_date: IsoDate,
    pub template: RuleTemplate,
}

/// Which occurrences an edit applies to. Only meaningful for template
/// changes: a schedule change is always [`EditScope::AllFuture`], because
/// "apply this new frequency to the next occurrence only" has no coherent
/// meaning.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EditScope {
    NextOccurrenceOnly,
    AllFuture,
}

impl EditScope {
    pub fn parse(value: &str) -> Result<Self, RecurringError> {
        match value {
            "NEXT_OCCURRENCE_ONLY" => Ok(EditScope::NextOccurrenceOnly),
            "ALL_FUTURE" => Ok(EditScope::AllFuture),
            other => Err(RecurringError::InvalidStoredValue(format!(
                "unknown edit scope: {other}"
            ))),
        }
    }
}

/// Serialized to Angular as `{ kind, message }`, same as `EntryError` and
/// `AccountError`. The messages stay English like the rest of the source:
/// Angular maps each `kind` to the French the user actually sees.
#[derive(Debug, Error, Serialize, PartialEq, Eq, Clone)]
#[serde(tag = "kind", content = "message")]
pub enum RecurringError {
    #[error("no such recurring rule")]
    NotFound,
    #[error("a recurring rule label cannot be empty")]
    EmptyLabel,
    #[error("a recurring rule interval must be at least 1")]
    InvalidInterval,
    #[error("a recurring rule's end date cannot fall before its start date")]
    EndDateBeforeStartDate,
    #[error("unknown category")]
    UnknownCategory,
    #[error("invalid amount: {0}")]
    InvalidAmount(String),
    #[error("a stored recurring rule value is invalid: {0}")]
    InvalidStoredValue(String),
    #[error("a filesystem or database error occurred: {0}")]
    Io(String),
}

impl From<InvalidAmount> for RecurringError {
    fn from(error: InvalidAmount) -> Self {
        RecurringError::InvalidAmount(error.to_string())
    }
}

/// Generation reads accounts (for the window's start and to stamp it), so
/// their failures have to arrive as this feature's error.
impl From<AccountError> for RecurringError {
    fn from(error: AccountError) -> Self {
        match error {
            AccountError::NotFound => RecurringError::NotFound,
            other => RecurringError::Io(other.to_string()),
        }
    }
}

/// The `n`-th occurrence of `schedule`, counting from zero at its start date.
///
/// **Anchored, not chained**: every occurrence is `start_date` advanced by
/// `n × interval` periods *from `start_date` itself*, never one period from
/// the previous occurrence. The difference is only visible at month ends and
/// it matters — a monthly rule starting 2026-01-31 runs 01-31, 02-28, 03-31,
/// 04-30, clamping down to a shorter month's last day and then back to the
/// 31st, whereas chaining would ratchet permanently down to the 28th after
/// the first February.
fn occurrence(schedule: &RuleSchedule, n: u32) -> IsoDate {
    let steps = schedule.interval.max(1) * n;
    match schedule.frequency {
        Frequency::Daily => schedule.start_date.add_days(steps),
        Frequency::Weekly => schedule.start_date.add_weeks(steps),
        Frequency::Monthly => schedule.start_date.add_months(steps),
        Frequency::Yearly => schedule.start_date.add_years(steps),
    }
}

/// Every occurrence date of `schedule` falling in the inclusive window
/// `[from, to]`, ascending, clipped by the schedule's own start and end
/// dates. A window entirely outside the rule's range yields nothing.
pub fn occurrences_between(schedule: &RuleSchedule, from: &IsoDate, to: &IsoDate) -> Vec<IsoDate> {
    let last = match &schedule.end_date {
        Some(end) if end < to => end,
        _ => to,
    };

    let mut dates = vec![];
    for n in 0.. {
        let date = occurrence(schedule, n);
        if &date > last {
            break;
        }
        if &date >= from {
            dates.push(date);
        }
    }
    dates
}

/// The rule's first occurrence strictly after `after`, or its first
/// occurrence overall when `after` is `None` — what the
/// [`EditScope::NextOccurrenceOnly`] scope keys its override to. `None` once
/// the schedule has run out.
pub fn next_occurrence_after(schedule: &RuleSchedule, after: Option<&IsoDate>) -> Option<IsoDate> {
    for n in 0.. {
        let date = occurrence(schedule, n);
        if schedule.end_date.as_ref().is_some_and(|end| &date > end) {
            return None;
        }
        // `Option::is_none_or` would read better but is newer than this
        // crate's MSRV (1.77.2).
        if match after {
            Some(after) => &date > after,
            None => true,
        } {
            return Some(date);
        }
    }
    unreachable!("occurrence dates increase without bound, so one exit always fires")
}

/// Persistence for recurring rules, their occurrence overrides, and the
/// generated-entry write.
///
/// The occurrence write lives here rather than on `EntryRepository` because
/// it is insert-if-absent against the partial unique index on
/// `entries (recurring_rule_id, date)` — the storage half of the idempotency
/// pair guarding the user's register against duplicated money — which is a
/// recurring-rule concern and not something an ordinary entry write does.
pub trait RecurringRuleRepository {
    fn list_by_account(&self, account_id: i64) -> Result<Vec<RecurringRule>, RecurringError>;

    fn find(&self, id: i64) -> Result<Option<RecurringRule>, RecurringError>;

    /// Inserts a rule. `category_id` pointing at an unknown category
    /// surfaces as [`RecurringError::UnknownCategory`] via the table's
    /// foreign key, rather than a redundant existence check here.
    fn create(
        &self,
        account_id: i64,
        details: &RecurringRuleDetails,
    ) -> Result<RecurringRule, RecurringError>;

    /// Rewrites every field of a rule. Already-generated entries are
    /// independent rows and are not touched.
    fn update(
        &self,
        id: i64,
        details: &RecurringRuleDetails,
    ) -> Result<RecurringRule, RecurringError>;

    /// Removes the rule and its overrides, and nulls `recurring_rule_id` on
    /// the entries it generated — which stay, since removing a rule must
    /// never remove history. Atomic: all three or none.
    fn delete(&self, id: i64) -> Result<(), RecurringError>;

    fn list_overrides(&self, rule_id: i64) -> Result<Vec<OccurrenceOverride>, RecurringError>;

    /// Writes an override, replacing any the rule already holds for that
    /// occurrence date — `UNIQUE (rule_id, occurrence_date)` makes one per
    /// occurrence true by construction.
    fn save_override(&self, occurrence: &OccurrenceOverride) -> Result<(), RecurringError>;

    /// Consumes an override once the generator has written its entry.
    fn delete_override(
        &self,
        rule_id: i64,
        occurrence_date: &IsoDate,
    ) -> Result<(), RecurringError>;

    /// Discards every outstanding override of a rule — what a schedule
    /// change does, since an override is keyed to a date the new schedule
    /// may no longer land on.
    fn delete_overrides(&self, rule_id: i64) -> Result<(), RecurringError>;

    /// Date of the rule's most recently generated occurrence, if any.
    fn last_generated_date(&self, rule_id: i64) -> Result<Option<IsoDate>, RecurringError>;

    /// Writes one occurrence as an ordinary, unreconciled entry, tagged with
    /// `rule_id`. `Ok(false)` means the occurrence was already present —
    /// swallowed and reported, never surfaced as an error.
    fn insert_occurrence_if_absent(
        &self,
        rule_id: i64,
        account_id: i64,
        date: &IsoDate,
        template: &RuleTemplate,
    ) -> Result<bool, RecurringError>;
}

pub type DynRecurringRuleRepository = Box<dyn RecurringRuleRepository + Send + Sync>;

#[cfg(test)]
mod tests {
    use super::*;

    fn date(value: &str) -> IsoDate {
        IsoDate::parse(value).unwrap()
    }

    fn schedule(
        frequency: Frequency,
        interval: u32,
        start: &str,
        end: Option<&str>,
    ) -> RuleSchedule {
        RuleSchedule {
            frequency,
            interval,
            start_date: date(start),
            end_date: end.map(date),
        }
    }

    fn between(schedule: &RuleSchedule, from: &str, to: &str) -> Vec<String> {
        occurrences_between(schedule, &date(from), &date(to))
            .iter()
            .map(|d| d.to_string())
            .collect()
    }

    #[test]
    fn a_daily_rule_lands_every_day() {
        let rule = schedule(Frequency::Daily, 1, "2026-03-02", None);

        assert_eq!(
            between(&rule, "2026-03-02", "2026-03-05"),
            ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"]
        );
    }

    #[test]
    fn a_daily_rule_with_an_interval_skips_the_days_between() {
        let rule = schedule(Frequency::Daily, 2, "2026-03-02", None);

        assert_eq!(
            between(&rule, "2026-03-02", "2026-03-10"),
            [
                "2026-03-02",
                "2026-03-04",
                "2026-03-06",
                "2026-03-08",
                "2026-03-10"
            ]
        );
    }

    #[test]
    fn a_weekly_rule_lands_every_seven_days() {
        let rule = schedule(Frequency::Weekly, 1, "2026-03-02", None);

        assert_eq!(
            between(&rule, "2026-03-02", "2026-03-23"),
            ["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23"]
        );
    }

    #[test]
    fn a_weekly_rule_with_an_interval_skips_the_weeks_between() {
        let rule = schedule(Frequency::Weekly, 3, "2026-03-02", None);

        assert_eq!(
            between(&rule, "2026-03-02", "2026-04-20"),
            ["2026-03-02", "2026-03-23", "2026-04-13"]
        );
    }

    #[test]
    fn a_monthly_rule_lands_on_the_same_day_each_month() {
        let rule = schedule(Frequency::Monthly, 1, "2026-03-05", None);

        assert_eq!(
            between(&rule, "2026-03-05", "2026-06-05"),
            ["2026-03-05", "2026-04-05", "2026-05-05", "2026-06-05"]
        );
    }

    #[test]
    fn a_monthly_rule_with_an_interval_skips_the_months_between() {
        let rule = schedule(Frequency::Monthly, 2, "2026-01-10", None);

        assert_eq!(
            between(&rule, "2026-01-10", "2026-07-10"),
            ["2026-01-10", "2026-03-10", "2026-05-10", "2026-07-10"]
        );
    }

    #[test]
    fn a_yearly_rule_lands_on_the_same_day_each_year() {
        let rule = schedule(Frequency::Yearly, 1, "2026-04-01", None);

        assert_eq!(
            between(&rule, "2026-04-01", "2029-04-01"),
            ["2026-04-01", "2027-04-01", "2028-04-01", "2029-04-01"]
        );
    }

    #[test]
    fn a_yearly_rule_with_an_interval_skips_the_years_between() {
        let rule = schedule(Frequency::Yearly, 2, "2026-04-01", None);

        assert_eq!(
            between(&rule, "2026-04-01", "2030-12-31"),
            ["2026-04-01", "2028-04-01", "2030-04-01"]
        );
    }

    /// User story 29, and the single most important behaviour in the spec:
    /// asserted as one sequence, because the anchored/chained difference
    /// only shows up past the second occurrence.
    #[test]
    fn a_monthly_rule_starting_on_the_31st_clamps_and_then_returns_to_the_31st() {
        let rule = schedule(Frequency::Monthly, 1, "2026-01-31", None);

        assert_eq!(
            between(&rule, "2026-01-31", "2026-05-31"),
            [
                "2026-01-31",
                "2026-02-28",
                "2026-03-31",
                "2026-04-30",
                "2026-05-31"
            ]
        );
    }

    #[test]
    fn a_yearly_rule_starting_on_a_leap_day_clamps_and_then_returns_to_the_29th() {
        let rule = schedule(Frequency::Yearly, 1, "2024-02-29", None);

        assert_eq!(
            between(&rule, "2024-02-29", "2028-12-31"),
            [
                "2024-02-29",
                "2025-02-28",
                "2026-02-28",
                "2027-02-28",
                "2028-02-29"
            ]
        );
    }

    #[test]
    fn a_window_entirely_before_the_start_date_is_empty() {
        let rule = schedule(Frequency::Monthly, 1, "2026-03-01", None);

        assert!(between(&rule, "2025-01-01", "2026-02-28").is_empty());
    }

    #[test]
    fn a_window_entirely_after_the_end_date_is_empty() {
        let rule = schedule(Frequency::Monthly, 1, "2026-01-01", Some("2026-03-01"));

        assert!(between(&rule, "2026-04-01", "2026-12-31").is_empty());
    }

    #[test]
    fn both_window_bounds_are_inclusive_when_they_fall_on_occurrences() {
        let rule = schedule(Frequency::Monthly, 1, "2026-01-15", None);

        assert_eq!(
            between(&rule, "2026-02-15", "2026-04-15"),
            ["2026-02-15", "2026-03-15", "2026-04-15"]
        );
    }

    #[test]
    fn an_occurrence_falling_exactly_on_the_end_date_is_included() {
        let rule = schedule(Frequency::Monthly, 1, "2026-01-15", Some("2026-03-15"));

        assert_eq!(
            between(&rule, "2026-01-01", "2026-12-31"),
            ["2026-01-15", "2026-02-15", "2026-03-15"]
        );
    }

    #[test]
    fn an_occurrence_the_day_after_the_end_date_is_excluded() {
        let rule = schedule(Frequency::Monthly, 1, "2026-01-15", Some("2026-03-14"));

        assert_eq!(
            between(&rule, "2026-01-01", "2026-12-31"),
            ["2026-01-15", "2026-02-15"]
        );
    }

    #[test]
    fn a_single_day_window_yields_that_day_when_it_is_an_occurrence() {
        let rule = schedule(Frequency::Monthly, 1, "2026-01-15", None);

        assert_eq!(between(&rule, "2026-03-15", "2026-03-15"), ["2026-03-15"]);
        assert!(between(&rule, "2026-03-16", "2026-03-16").is_empty());
    }

    #[test]
    fn an_open_ended_rule_runs_to_the_windows_far_edge() {
        let rule = schedule(Frequency::Yearly, 1, "2026-06-01", None);

        assert_eq!(
            between(&rule, "2026-01-01", "2030-06-01").len(),
            5,
            "2026 through 2030 inclusive"
        );
    }

    #[test]
    fn an_interval_of_zero_is_treated_as_one_rather_than_looping_forever() {
        let rule = schedule(Frequency::Monthly, 0, "2026-01-01", None);

        assert_eq!(
            between(&rule, "2026-01-01", "2026-03-01"),
            ["2026-01-01", "2026-02-01", "2026-03-01"]
        );
    }

    #[test]
    fn the_next_occurrence_of_an_ungenerated_rule_is_its_first() {
        let rule = schedule(Frequency::Monthly, 1, "2026-03-10", None);

        assert_eq!(
            next_occurrence_after(&rule, None).map(|d| d.to_string()),
            Some("2026-03-10".to_owned())
        );
    }

    #[test]
    fn the_next_occurrence_is_strictly_after_the_last_generated_one() {
        let rule = schedule(Frequency::Monthly, 1, "2026-03-10", None);

        assert_eq!(
            next_occurrence_after(&rule, Some(&date("2026-05-10"))).map(|d| d.to_string()),
            Some("2026-06-10".to_owned())
        );
    }

    #[test]
    fn a_rule_that_has_run_out_has_no_next_occurrence() {
        let rule = schedule(Frequency::Monthly, 1, "2026-01-10", Some("2026-03-10"));

        assert_eq!(
            next_occurrence_after(&rule, Some(&date("2026-03-10"))),
            None
        );
    }

    #[test]
    fn frequency_round_trips_through_its_stored_value() {
        for frequency in [
            Frequency::Daily,
            Frequency::Weekly,
            Frequency::Monthly,
            Frequency::Yearly,
        ] {
            assert_eq!(Frequency::parse(frequency.as_str()).unwrap(), frequency);
        }
        assert!(Frequency::parse("FORTNIGHTLY").is_err());
    }

    #[test]
    fn an_unknown_edit_scope_is_rejected() {
        assert_eq!(
            EditScope::parse("ALL_FUTURE").unwrap(),
            EditScope::AllFuture
        );
        assert!(EditScope::parse("JUST_THIS_ONE").is_err());
    }
}
