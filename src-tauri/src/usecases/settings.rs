//! Orchestrates the settings repository. Thin pass-through: parsing/storage
//! concerns live in the repository implementation, since they're inherently
//! an infra concern.

use crate::domain::settings::{DisplaySettings, SettingsError, SettingsRepository};

pub fn get_display_settings(
    repo: &dyn SettingsRepository,
) -> Result<DisplaySettings, SettingsError> {
    repo.get_display_settings()
}

pub fn update_display_settings(
    repo: &dyn SettingsRepository,
    settings: DisplaySettings,
) -> Result<(), SettingsError> {
    repo.update_display_settings(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::settings::{CurrencyFormat, DateFormat};
    use std::cell::RefCell;

    struct FakeRepository {
        settings: RefCell<DisplaySettings>,
    }

    impl Default for FakeRepository {
        fn default() -> Self {
            Self {
                settings: RefCell::new(DisplaySettings {
                    date_format: DateFormat::Dmy,
                    currency_format: CurrencyFormat::SymbolAfter,
                }),
            }
        }
    }

    impl SettingsRepository for FakeRepository {
        fn get_display_settings(&self) -> Result<DisplaySettings, SettingsError> {
            Ok(*self.settings.borrow())
        }

        fn update_display_settings(&self, settings: DisplaySettings) -> Result<(), SettingsError> {
            *self.settings.borrow_mut() = settings;
            Ok(())
        }
    }

    #[test]
    fn get_display_settings_delegates_to_the_repository() {
        let repo = FakeRepository::default();
        let settings = get_display_settings(&repo).unwrap();
        assert_eq!(settings.date_format, DateFormat::Dmy);
        assert_eq!(settings.currency_format, CurrencyFormat::SymbolAfter);
    }

    #[test]
    fn update_display_settings_delegates_to_the_repository() {
        let repo = FakeRepository::default();
        let new_settings = DisplaySettings {
            date_format: DateFormat::Ymd,
            currency_format: CurrencyFormat::IsoCode,
        };

        update_display_settings(&repo, new_settings).unwrap();

        assert_eq!(get_display_settings(&repo).unwrap(), new_settings);
    }
}
