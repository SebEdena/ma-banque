//! Conversion between the major-unit `f64` amounts crossing the Tauri
//! boundary and the `i64` cents everything else stores and computes with
//! (technical-architecture.md §1.3). Rust owns this conversion in both
//! directions; Angular never multiplies, divides, or rounds an amount.

use std::fmt;

/// Largest magnitude in cents that survives a round-trip through `f64`
/// without losing whole cents (`2^53`, `f64`'s exact-integer limit).
const MAX_EXACT_CENTS: i64 = 9_007_199_254_740_992;

/// Tolerance on the cents scaling, absorbing the representation error of
/// values like `1234.56` (which scales to `123455.99999999999`) while still
/// rejecting genuinely sub-cent input like `1234.567`.
const SCALING_TOLERANCE: f64 = 1e-6;

pub fn to_cents(major: f64) -> Result<i64, InvalidAmount> {
    if !major.is_finite() {
        return Err(InvalidAmount(major));
    }

    let scaled = major * 100.0;
    if (scaled - scaled.round()).abs() > SCALING_TOLERANCE {
        return Err(InvalidAmount(major));
    }

    let cents = scaled.round();
    if cents.abs() > MAX_EXACT_CENTS as f64 {
        return Err(InvalidAmount(major));
    }

    Ok(cents as i64)
}

pub fn to_major(cents: i64) -> f64 {
    cents as f64 / 100.0
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct InvalidAmount(pub f64);

impl fmt::Display for InvalidAmount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "`{}` is not a valid amount in cents", self.0)
    }
}

impl std::error::Error for InvalidAmount {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_major_units_to_cents() {
        assert_eq!(to_cents(1234.56).unwrap(), 123_456);
        assert_eq!(to_cents(0.0).unwrap(), 0);
        assert_eq!(to_cents(-42.10).unwrap(), -4_210);
        assert_eq!(to_cents(0.1).unwrap(), 10);
    }

    #[test]
    fn rejects_amounts_finer_than_a_cent() {
        assert!(to_cents(1234.567).is_err());
        assert!(to_cents(0.001).is_err());
    }

    #[test]
    fn rejects_non_finite_amounts() {
        assert!(to_cents(f64::NAN).is_err());
        assert!(to_cents(f64::INFINITY).is_err());
        assert!(to_cents(f64::MAX).is_err());
    }

    #[test]
    fn round_trips_through_major_units() {
        for cents in [0, 1, -1, 123_456, -987_654_321] {
            assert_eq!(to_cents(to_major(cents)).unwrap(), cents);
        }
    }
}
