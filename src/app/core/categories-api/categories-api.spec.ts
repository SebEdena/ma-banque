import { parseCategoryError } from './categories-api';

describe('parseCategoryError', () => {
  it('names the blocking reason for a category entries still use', () => {
    expect(parseCategoryError({ kind: 'InUse' })).toBe(
      'ce poste est utilisé par des écritures et ne peut pas être supprimé',
    );
  });

  it('maps every field-validation backstop to its French wording', () => {
    expect(parseCategoryError({ kind: 'EmptyName' })).toBe('le nom du poste ne peut pas être vide');
    expect(parseCategoryError({ kind: 'EmptyIcon' })).toBe('un poste doit avoir une icône');
  });

  it('passes through the message an Io error carries', () => {
    expect(parseCategoryError({ kind: 'Io', message: 'disk full' })).toBe('disk full');
  });

  it('falls back to a generic message for anything that is not a CategoryError', () => {
    expect(parseCategoryError(new Error('boom'))).toBe("une erreur inattendue s'est produite");
    expect(parseCategoryError(null)).toBe("une erreur inattendue s'est produite");
  });
});
