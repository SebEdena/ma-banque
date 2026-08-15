import type { BrnCalendarI18n } from '@spartan-ng/brain/calendar';

/** `formatWeekdayName`/`labelWeekday` are called with 0 = Sunday, matching the ui kit's default. */
const WEEKDAY_LABELS = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
] as const;

/**
 * French labels for the shared `hlm-calendar` (the entries screen's date
 * picker) — the ui kit ships English ones by default, and this app's UI is
 * French throughout. `firstDayOfWeek` is Monday, the French convention.
 */
export const FRENCH_CALENDAR_I18N: Partial<BrnCalendarI18n> = {
  formatWeekdayName: (index) =>
    new Date(2023, 0, index + 1).toLocaleDateString('fr-FR', { weekday: 'short' }),
  labelWeekday: (index) => WEEKDAY_LABELS[index],
  months: () => [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ],
  formatMonth: (month) => new Date(2000, month, 1).toLocaleDateString('fr-FR', { month: 'short' }),
  formatYear: (year) => String(year),
  formatHeader: (month, year) =>
    new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
  labelPrevious: () => 'Mois précédent',
  labelNext: () => 'Mois suivant',
  firstDayOfWeek: () => 1,
};
