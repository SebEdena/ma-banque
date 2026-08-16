import { parseAccountError } from './accounts-api';

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
