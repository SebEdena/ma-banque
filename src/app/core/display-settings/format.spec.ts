import { formatAmount, formatDate } from './format';

describe('formatDate', () => {
  const date = new Date(2026, 2, 7); // 7 March 2026 (month is 0-indexed)

  it('formats DMY as JJ/MM/AAAA', () => {
    expect(formatDate(date, 'DMY')).toBe('07/03/2026');
  });

  it('formats YMD as AAAA-MM-JJ', () => {
    expect(formatDate(date, 'YMD')).toBe('2026-03-07');
  });

  it('formats MDY as MM/JJ/AAAA', () => {
    expect(formatDate(date, 'MDY')).toBe('03/07/2026');
  });
});

describe('formatAmount', () => {
  it('formats SYMBOL_AFTER as "amount €"', () => {
    expect(formatAmount(1234.56, 'SYMBOL_AFTER')).toBe('1 234,56 €');
  });

  it('formats SYMBOL_BEFORE as "€ amount"', () => {
    expect(formatAmount(1234.56, 'SYMBOL_BEFORE')).toBe('€ 1 234,56');
  });

  it('formats ISO_CODE as "amount EUR"', () => {
    expect(formatAmount(1234.56, 'ISO_CODE')).toBe('1 234,56 EUR');
  });

  it('never divides by 100 — passes the decimal amount straight through', () => {
    expect(formatAmount(1, 'SYMBOL_AFTER')).toBe('1,00 €');
  });
});
