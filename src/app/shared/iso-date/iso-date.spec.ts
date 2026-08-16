import { parseIsoDate, toIsoDate, todayIso } from './iso-date';

describe('parseIsoDate', () => {
  it('reads an ISO date as local midnight, not UTC', () => {
    const date = parseIsoDate('2026-03-05');

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(5);
    expect(date.getHours()).toBe(0);
  });
});

describe('toIsoDate', () => {
  it('is the inverse of parseIsoDate', () => {
    expect(toIsoDate(new Date(2026, 2, 5))).toBe('2026-03-05');
  });

  it('pads single-digit months and days', () => {
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('todayIso', () => {
  it("matches the current date's local parts", () => {
    const now = new Date();
    const expected = toIsoDate(now);

    expect(todayIso()).toBe(expected);
  });
});
