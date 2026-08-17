import {
  RECONCILIATION_INVALID_AMOUNT_MESSAGE,
  parseReconciliationError,
} from './reconciliation-api';

describe('parseReconciliationError', () => {
  it('gives each business failure its own French message', () => {
    expect(parseReconciliationError({ kind: 'UnknownAccount' })).toBe("ce compte n'existe plus");
    expect(parseReconciliationError({ kind: 'InvalidAmount', message: 'nope' })).toBe(
      RECONCILIATION_INVALID_AMOUNT_MESSAGE,
    );
    expect(parseReconciliationError({ kind: 'InvalidDate', message: 'nope' })).toBe(
      'la date du relevé est invalide',
    );
  });

  it('surfaces the backend message for I/O failures', () => {
    expect(parseReconciliationError({ kind: 'Io', message: 'disk on fire' })).toBe('disk on fire');
  });

  it('falls back for anything that is not a ReconciliationError', () => {
    for (const error of [null, undefined, 'boom', new Error('boom'), { code: 500 }]) {
      expect(parseReconciliationError(error)).toBe("une erreur inattendue s'est produite");
    }
  });
});
