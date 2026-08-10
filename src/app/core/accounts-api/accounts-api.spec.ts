import { parseAccountError, parseIsoDate } from './accounts-api';

describe('parseAccountError', () => {
  it('gives each business failure its own French message', () => {
    expect(parseAccountError({ kind: 'HasNonSystemEntries' })).toBe(
      'ce compte contient des écritures et ne peut pas être supprimé',
    );
    expect(parseAccountError({ kind: 'OpeningDateNotBeforeFirstEntry' })).toBe(
      "la date d'ouverture doit précéder la première écriture du compte",
    );
    expect(parseAccountError({ kind: 'EmptyName' })).toBe('le nom du compte ne peut pas être vide');
  });

  it('surfaces the backend message for I/O failures', () => {
    expect(parseAccountError({ kind: 'Io', message: 'disk on fire' })).toBe('disk on fire');
  });

  it('falls back for anything that is not an AccountError', () => {
    for (const error of [null, undefined, 'boom', new Error('boom'), { code: 500 }]) {
      expect(parseAccountError(error)).toBe("une erreur inattendue s'est produite");
    }
  });
});

describe('parseIsoDate', () => {
  it('reads an ISO date as local midnight, not UTC', () => {
    const date = parseIsoDate('2026-03-05');

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(5);
    expect(date.getHours()).toBe(0);
  });
});
