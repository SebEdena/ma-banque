//! Calendar dates as ISO-8601 `YYYY-MM-DD` strings.
//!
//! Fixed-width, zero-padded ISO dates sort lexicographically in
//! chronological order, so `Ord` here *is* chronological ordering — the
//! opening-date invariant in `usecases::account` and SQLite's own `ORDER BY
//! date` rely on that equivalence, which only holds because nothing can
//! construct an `IsoDate` without going through [`IsoDate::parse`].

use std::fmt;

use serde::{Deserialize, Deserializer, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(transparent)]
pub struct IsoDate(String);

impl IsoDate {
    pub fn parse(value: &str) -> Result<Self, InvalidDate> {
        let invalid = || InvalidDate(value.to_owned());

        let bytes = value.as_bytes();
        if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
            return Err(invalid());
        }

        let number = |range: std::ops::Range<usize>| {
            value[range.clone()]
                .bytes()
                .all(|b| b.is_ascii_digit())
                .then(|| value[range].parse::<u32>().ok())
                .flatten()
                .ok_or_else(invalid)
        };

        let year = number(0..4)?;
        let month = number(5..7)?;
        let day = number(8..10)?;

        if !(1..=12).contains(&month) || day < 1 || day > days_in_month(year, month) {
            return Err(invalid());
        }

        Ok(Self(value.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// `(year, month, day)` — infallible, since nothing can construct an
    /// `IsoDate` without going through [`IsoDate::parse`].
    fn parts(&self) -> (u32, u32, u32) {
        let number = |range: std::ops::Range<usize>| self.0[range].parse::<u32>().unwrap();
        (number(0..4), number(5..7), number(8..10))
    }

    /// Rebuilds a date from its parts, clamping `day` to the target month's
    /// length — the one rule that makes every method below infallible.
    fn from_parts(year: u32, month: u32, day: u32) -> Self {
        let day = day.min(days_in_month(year, month));
        Self(format!("{year:04}-{month:02}-{day:02}"))
    }

    /// Advances by whole weeks. Walks a month at a time rather than a day at
    /// a time, so leap years and month lengths come from [`days_in_month`]
    /// like everything else here.
    pub fn add_weeks(&self, weeks: u32) -> Self {
        let (mut year, mut month, mut day) = self.parts();
        let mut remaining = weeks * 7;

        loop {
            let month_length = days_in_month(year, month);
            if day + remaining <= month_length {
                return Self::from_parts(year, month, day + remaining);
            }
            remaining -= month_length - day + 1;
            day = 1;
            (year, month) = if month == 12 {
                (year + 1, 1)
            } else {
                (year, month + 1)
            };
        }
    }

    /// Advances by whole months, clamping the day to the target month's
    /// length — 31 January plus one month is 28 (or 29) February, not
    /// 3 March.
    pub fn add_months(&self, months: u32) -> Self {
        let (year, month, day) = self.parts();
        let total = (month - 1) + months;
        Self::from_parts(year + total / 12, total % 12 + 1, day)
    }

    /// Advances by whole years, clamping 29 February to the 28th in a
    /// common year.
    pub fn add_years(&self, years: u32) -> Self {
        let (year, month, day) = self.parts();
        Self::from_parts(year + years, month, day)
    }
}

fn days_in_month(year: u32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        _ => 0,
    }
}

impl fmt::Display for IsoDate {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for IsoDate {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(deserializer)?;
        IsoDate::parse(&raw).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidDate(pub String);

impl fmt::Display for InvalidDate {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "`{}` is not a valid YYYY-MM-DD date", self.0)
    }
}

impl std::error::Error for InvalidDate {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_well_formed_date() {
        assert_eq!(IsoDate::parse("2026-08-10").unwrap().as_str(), "2026-08-10");
    }

    #[test]
    fn rejects_malformed_or_impossible_dates() {
        for value in [
            "",
            "2026-8-10",
            "10/08/2026",
            "2026-13-01",
            "2026-00-01",
            "2026-01-32",
            "2026-02-30",
            "2025-02-29",
            "2026-08-10T12:00:00",
            "abcd-ef-gh",
        ] {
            assert!(
                IsoDate::parse(value).is_err(),
                "expected {value} to be rejected"
            );
        }
    }

    #[test]
    fn accepts_leap_days_only_in_leap_years() {
        assert!(IsoDate::parse("2024-02-29").is_ok());
        assert!(IsoDate::parse("2000-02-29").is_ok());
        assert!(IsoDate::parse("1900-02-29").is_err());
    }

    fn date(value: &str) -> IsoDate {
        IsoDate::parse(value).unwrap()
    }

    #[test]
    fn add_weeks_crosses_a_month_boundary() {
        assert_eq!(date("2026-01-25").add_weeks(2), date("2026-02-08"));
    }

    #[test]
    fn add_weeks_crosses_a_year_boundary() {
        assert_eq!(date("2025-12-25").add_weeks(2), date("2026-01-08"));
    }

    #[test]
    fn add_weeks_crosses_a_leap_day() {
        assert_eq!(date("2024-02-26").add_weeks(1), date("2024-03-04"));
    }

    #[test]
    fn add_months_clamps_to_a_shorter_months_last_day() {
        assert_eq!(date("2026-01-31").add_months(1), date("2026-02-28"));
        assert_eq!(date("2024-01-31").add_months(1), date("2024-02-29"));
        assert_eq!(date("2026-03-31").add_months(1), date("2026-04-30"));
    }

    #[test]
    fn add_months_crosses_a_year_boundary() {
        assert_eq!(date("2026-11-15").add_months(3), date("2027-02-15"));
        assert_eq!(date("2026-01-15").add_months(24), date("2028-01-15"));
    }

    #[test]
    fn add_years_clamps_a_leap_day_to_the_28th() {
        assert_eq!(date("2024-02-29").add_years(1), date("2025-02-28"));
        assert_eq!(date("2024-02-29").add_years(4), date("2028-02-29"));
    }

    #[test]
    fn adding_nothing_is_the_identity() {
        for value in ["2026-01-31", "2024-02-29", "2026-06-15"] {
            assert_eq!(date(value).add_weeks(0), date(value));
            assert_eq!(date(value).add_months(0), date(value));
            assert_eq!(date(value).add_years(0), date(value));
        }
    }

    #[test]
    fn a_mid_month_day_is_preserved_unchanged() {
        assert_eq!(date("2026-06-15").add_months(1), date("2026-07-15"));
        assert_eq!(date("2026-06-15").add_months(8), date("2027-02-15"));
        assert_eq!(date("2026-06-15").add_years(3), date("2029-06-15"));
        assert_eq!(date("2026-06-15").add_weeks(4), date("2026-07-13"));
    }

    #[test]
    fn ordering_is_chronological() {
        let earlier = IsoDate::parse("2026-01-09").unwrap();
        let later = IsoDate::parse("2026-01-10").unwrap();
        let much_later = IsoDate::parse("2026-02-01").unwrap();

        assert!(earlier < later);
        assert!(later < much_later);
    }
}
