import { parseStatisticsError } from './statistics-api';

describe('parseStatisticsError', () => {
  it('names the account-not-found case', () => {
    expect(parseStatisticsError({ kind: 'NotFound' })).toBe("ce compte n'existe plus");
  });

  it('reports invalid stored values', () => {
    expect(parseStatisticsError({ kind: 'InvalidStoredValue' })).toBe(
      'les données du compte contiennent une valeur invalide',
    );
  });

  it('passes through the message an Io error carries', () => {
    expect(parseStatisticsError({ kind: 'Io', message: 'disk full' })).toBe('disk full');
  });

  it('falls back to a generic message for anything that is not a StatisticsError', () => {
    expect(parseStatisticsError(new Error('boom'))).toBe("une erreur inattendue s'est produite");
    expect(parseStatisticsError(null)).toBe("une erreur inattendue s'est produite");
  });
});
