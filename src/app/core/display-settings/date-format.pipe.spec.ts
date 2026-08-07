import { DateFormatPipe } from './date-format.pipe';

describe('DateFormatPipe', () => {
  const pipe = new DateFormatPipe();
  const date = new Date(2026, 2, 7); // 7 March 2026

  it('delegates to formatDate for DMY', () => {
    expect(pipe.transform(date, 'DMY')).toBe('07/03/2026');
  });

  it('delegates to formatDate for YMD', () => {
    expect(pipe.transform(date, 'YMD')).toBe('2026-03-07');
  });

  it('delegates to formatDate for MDY', () => {
    expect(pipe.transform(date, 'MDY')).toBe('03/07/2026');
  });
});
