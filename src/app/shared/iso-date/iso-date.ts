/**
 * Turns a backend ISO `YYYY-MM-DD` string into a `Date` at **local**
 * midnight. `new Date('2026-01-15')` would parse as UTC midnight and render
 * as the day before in any negative-offset timezone; `formatDate` reads local
 * date parts, so the two have to agree.
 */
export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The inverse of `parseIsoDate`: a `Date`'s local parts as `YYYY-MM-DD`. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Today as the `YYYY-MM-DD` the backend speaks. */
export function todayIso(): string {
  return toIsoDate(new Date());
}
