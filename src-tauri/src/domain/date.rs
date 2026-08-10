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

    #[test]
    fn ordering_is_chronological() {
        let earlier = IsoDate::parse("2026-01-09").unwrap();
        let later = IsoDate::parse("2026-01-10").unwrap();
        let much_later = IsoDate::parse("2026-02-01").unwrap();

        assert!(earlier < later);
        assert!(later < much_later);
    }
}
