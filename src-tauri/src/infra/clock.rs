//! The crate's entire clock surface.
//!
//! `std` can produce an epoch instant but not a local-timezone calendar
//! date, and a UTC-derived "today" would be a day early or late for most of
//! the day depending on the offset — which for a feature that generates a
//! user's rent on a given date is a real bug, not a rounding detail. Hence
//! `chrono`, and hence exactly one function using it: everything downstream
//! takes an [`IsoDate`] parameter instead of reading the clock, which is
//! what makes generation deterministic under test with no clock abstraction.

use chrono::Local;

use crate::domain::date::IsoDate;

// Called by the generation commands, which the generation-engine spec adds:
// `today` is resolved once per invocation there and passed down as a date.
#[allow(dead_code)]
pub fn today() -> IsoDate {
    IsoDate::parse(&Local::now().date_naive().format("%Y-%m-%d").to_string())
        .expect("chrono formats a local date as a valid YYYY-MM-DD")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn today_is_a_well_formed_iso_date() {
        // Nothing here can assert *which* day it is without reimplementing
        // the clock; what matters is that the parse contract above holds.
        let today = today();

        assert_eq!(today.as_str().len(), 10);
        assert_eq!(IsoDate::parse(today.as_str()).unwrap(), today);
    }
}
