import { CurrencyFormatPipe } from './currency-format.pipe';
import { formatAmount } from './format';

describe('CurrencyFormatPipe', () => {
  const pipe = new CurrencyFormatPipe();

  it('delegates to formatAmount for SYMBOL_AFTER', () => {
    expect(pipe.transform(1234.56, 'SYMBOL_AFTER')).toBe(formatAmount(1234.56, 'SYMBOL_AFTER'));
  });

  it('delegates to formatAmount for SYMBOL_BEFORE', () => {
    expect(pipe.transform(1234.56, 'SYMBOL_BEFORE')).toBe(formatAmount(1234.56, 'SYMBOL_BEFORE'));
  });

  it('delegates to formatAmount for ISO_CODE', () => {
    expect(pipe.transform(1234.56, 'ISO_CODE')).toBe(formatAmount(1234.56, 'ISO_CODE'));
  });
});
