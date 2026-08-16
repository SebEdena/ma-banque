import { parseEntryError } from './entries-api';

describe('parseEntryError', () => {
  it('gives each business failure its own French message', () => {
    expect(parseEntryError({ kind: 'SystemEntryReadOnly' })).toBe(
      "l'écriture de solde initial se modifie depuis les paramètres du compte",
    );
    expect(parseEntryError({ kind: 'EmptyLabel' })).toBe(
      "le libellé de l'écriture ne peut pas être vide",
    );
    expect(parseEntryError({ kind: 'InvalidAmount' })).toBe(
      "le montant de l'écriture est invalide",
    );
  });

  it('surfaces the backend message for I/O failures', () => {
    expect(parseEntryError({ kind: 'Io', message: 'disk on fire' })).toBe('disk on fire');
  });

  it('falls back for anything that is not an EntryError', () => {
    for (const error of [null, undefined, 'boom', new Error('boom'), { code: 500 }]) {
      expect(parseEntryError(error)).toBe("une erreur inattendue s'est produite");
    }
  });
});
