//! Use cases for statistics aggregation — category breakdown and monthly totals.
//! Handles period preset resolution and gap-filling, delegating SQL aggregation
//! to the repository.

use std::time::SystemTime;

use crate::domain::date::IsoDate;
use crate::domain::entry::EntryRepository;
use crate::domain::statistics::{MonthBucket, MonthBucketedResponse, PeriodPreset};

/// Derives the inclusive date range (N months ending today) for a period preset.
fn date_range_for_preset(preset: PeriodPreset) -> (IsoDate, IsoDate) {
    let today = today_string();
    let (year, month, _day) = parse_date_parts(&today);

    // Calculate the start of N months ago
    let months_back = preset.months();
    let mut new_month = month as i32 - months_back;
    let mut new_year = year;

    while new_month <= 0 {
        new_month += 12;
        new_year -= 1;
    }

    let from_str = format!("{new_year:04}-{new_month:02}-01");
    let to_str = today;

    (
        IsoDate::parse(&from_str).expect("derived from date should be valid"),
        IsoDate::parse(&to_str).expect("today's date should be valid"),
    )
}

/// Returns today's date in YYYY-MM-DD format.
fn today_string() -> String {
    let secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Simple Unix timestamp to date conversion (without external dependencies)
    // This is a naive calculation suitable for dates after 1970
    let days_since_epoch = secs / 86400;

    // Account for leap years and month lengths
    let mut year = 1970;
    let mut days_left = days_since_epoch;

    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if days_left < days_in_year as u64 {
            break;
        }
        days_left -= days_in_year as u64;
        year += 1;
    }

    let mut month = 1;
    let mut day = days_left + 1;

    let days_per_month = [
        31,
        if is_leap_year(year) { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];

    for &days in &days_per_month {
        if day <= days as u64 {
            break;
        }
        day -= days as u64;
        month += 1;
    }

    format!("{year:04}-{month:02}-{day:02}")
}

fn is_leap_year(year: u32) -> bool {
    (year % 4 == 0) && (year % 100 != 0 || year % 400 == 0)
}

/// Extracts (year, month, day) from a date string "YYYY-MM-DD".
fn parse_date_parts(date: &str) -> (u32, u32, u32) {
    let year = date[0..4].parse::<u32>().expect("year should parse");
    let month = date[5..7].parse::<u32>().expect("month should parse");
    let day = date[8..10].parse::<u32>().expect("day should parse");
    (year, month, day)
}

/// Fetches the category breakdown for an account over a period preset,
/// computing percentages in Rust.
pub fn category_breakdown(
    repo: &dyn EntryRepository,
    account_id: i64,
    preset: PeriodPreset,
) -> Result<crate::domain::statistics::CategoryBreakdownResponse, crate::domain::entry::EntryError>
{
    let (from, to) = date_range_for_preset(preset);
    repo.category_breakdown_aggregate(account_id, &from, &to)
}

/// Fetches the month-bucketed aggregate for an account over a period preset,
/// filling in months with zero activity so the series always covers every
/// month of the period.
pub fn month_bucketed(
    repo: &dyn EntryRepository,
    account_id: i64,
    preset: PeriodPreset,
) -> Result<MonthBucketedResponse, crate::domain::entry::EntryError> {
    let (from, to) = date_range_for_preset(preset);
    let response = repo.month_bucketed_aggregate(account_id, &from, &to)?;

    // Fill in missing months with zero-valued entries
    let filled_months = fill_missing_months(&response.months, &from, &to);

    Ok(MonthBucketedResponse {
        months: filled_months,
    })
}

/// Fills in missing months between `from` and `to` with zero-valued entries,
/// returning a complete chronological series.
fn fill_missing_months(existing: &[MonthBucket], from: &IsoDate, to: &IsoDate) -> Vec<MonthBucket> {
    if existing.is_empty() {
        return Vec::new();
    }

    let mut result = Vec::new();
    let mut current = month_from_date(from);
    let end = month_from_date(to);

    let existing_map: std::collections::HashMap<String, &MonthBucket> =
        existing.iter().map(|m| (m.month.clone(), m)).collect();

    while current <= end {
        let month_str = format!("{:04}-{:02}", current.0, current.1);
        if let Some(bucket) = existing_map.get(&month_str) {
            result.push((*bucket).clone());
        } else {
            result.push(MonthBucket {
                month: month_str,
                income: 0,
                expense: 0,
            });
        }
        advance_month(&mut current);
    }

    result
}

/// Extracts (year, month) from an IsoDate string "YYYY-MM-DD".
fn month_from_date(date: &IsoDate) -> (i32, u32) {
    let s = date.as_str();
    let year = s[0..4].parse::<i32>().expect("year should parse");
    let month = s[5..7].parse::<u32>().expect("month should parse");
    (year, month)
}

/// Advances to the next month, wrapping the year as needed.
fn advance_month(current: &mut (i32, u32)) {
    current.1 += 1;
    if current.1 > 12 {
        current.1 = 1;
        current.0 += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_range_for_one_month_preset_ends_today() {
        let (_from, to) = date_range_for_preset(PeriodPreset::OneMonth);
        let today = today_string();

        assert_eq!(to.as_str(), &today);
    }

    #[test]
    fn date_range_for_one_month_preset_starts_one_month_ago() {
        let (from, _to) = date_range_for_preset(PeriodPreset::OneMonth);
        let (year, month, _day) = parse_date_parts(&today_string());

        let expected_month = if month == 1 { 12 } else { month - 1 };
        let expected_year = if month == 1 { year - 1 } else { year };

        assert_eq!(
            from.as_str(),
            &format!("{expected_year:04}-{expected_month:02}-01")
        );
    }

    #[test]
    fn month_bucketed_fills_missing_months_in_the_period() {
        let existing = vec![
            MonthBucket {
                month: "2026-02".to_owned(),
                income: 1_000,
                expense: 500,
            },
            MonthBucket {
                month: "2026-05".to_owned(),
                income: 2_000,
                expense: 1_000,
            },
        ];

        let from = IsoDate::parse("2026-02-01").unwrap();
        let to = IsoDate::parse("2026-05-31").unwrap();

        let filled = fill_missing_months(&existing, &from, &to);

        assert_eq!(filled.len(), 4); // 02, 03, 04, 05
        assert_eq!(filled[0].month, "2026-02");
        assert_eq!(filled[0].income, 1_000);
        assert_eq!(filled[1].month, "2026-03");
        assert_eq!(filled[1].income, 0);
        assert_eq!(filled[1].expense, 0);
        assert_eq!(filled[2].month, "2026-04");
        assert_eq!(filled[2].income, 0);
        assert_eq!(filled[3].month, "2026-05");
        assert_eq!(filled[3].income, 2_000);
    }

    #[test]
    fn month_bucketed_returns_empty_when_no_months_exist() {
        let existing: Vec<MonthBucket> = vec![];
        let from = IsoDate::parse("2026-02-01").unwrap();
        let to = IsoDate::parse("2026-05-31").unwrap();

        let filled = fill_missing_months(&existing, &from, &to);

        assert_eq!(filled.len(), 0);
    }

    #[test]
    fn month_bucketed_wraps_year_boundary() {
        let existing = vec![
            MonthBucket {
                month: "2025-11".to_owned(),
                income: 1_000,
                expense: 500,
            },
            MonthBucket {
                month: "2026-02".to_owned(),
                income: 2_000,
                expense: 1_000,
            },
        ];

        let from = IsoDate::parse("2025-11-01").unwrap();
        let to = IsoDate::parse("2026-02-28").unwrap();

        let filled = fill_missing_months(&existing, &from, &to);

        assert_eq!(filled.len(), 4); // 2025-11, 2025-12, 2026-01, 2026-02
        assert_eq!(filled[0].month, "2025-11");
        assert_eq!(filled[1].month, "2025-12");
        assert_eq!(filled[2].month, "2026-01");
        assert_eq!(filled[3].month, "2026-02");
    }
}
