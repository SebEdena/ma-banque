import { generatedEntriesMessage, parseRecurringError } from './recurring-rules-api';

describe('parseRecurringError', () => {
  it('gives each business failure its own French message', () => {
    const messages = (
      [
        'NotFound',
        'EmptyLabel',
        'InvalidInterval',
        'EndDateBeforeStartDate',
        'UnknownCategory',
        'InvalidAmount',
        'InvalidStoredValue',
      ] as const
    ).map((kind) => parseRecurringError({ kind }));

    expect(new Set(messages).size).toBe(messages.length);
    expect(messages).not.toContain("une erreur inattendue s'est produite");
  });

  it('surfaces the backend message for I/O failures', () => {
    expect(parseRecurringError({ kind: 'Io', message: 'disque plein' })).toBe('disque plein');
  });

  it('falls back for anything that is not a RecurringError', () => {
    for (const error of [null, undefined, 'boom', new Error('boom'), { code: 500 }]) {
      expect(parseRecurringError(error)).toBe("une erreur inattendue s'est produite");
    }
  });
});

describe('generatedEntriesMessage', () => {
  it('agrees in number with the count it reports', () => {
    expect(generatedEntriesMessage(1)).toBe('1 écriture générée');
    expect(generatedEntriesMessage(4)).toBe('4 écritures générées');
  });
});
