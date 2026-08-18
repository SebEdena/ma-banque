import { toIsoDate } from '@shared/iso-date/iso-date';
import { EntriesApi, Entry, EntryInput, EntryPage, ListEntriesQuery } from './entries-api';

const LABELS: { label: string; category_id: number | null; amount: number; description: string }[] =
  [
    { label: 'Courses Carrefour', category_id: 1, amount: -64.32, description: 'Hebdomadaire' },
    // Amount and category match the "Loyer" rule `InMemoryRecurringRulesApi`
    // seeds, so the register reads as what that rule would have generated.
    { label: 'Loyer', category_id: 2, amount: -750, description: '' },
    { label: 'Salaire', category_id: 9, amount: 2450.9, description: 'Virement employeur' },
    { label: 'Essence', category_id: 3, amount: -58.4, description: '' },
    { label: 'Restaurant Le Cèdre', category_id: 4, amount: -42.5, description: 'Déjeuner' },
    { label: 'Abonnement musique', category_id: 8, amount: -10.99, description: '' },
    { label: 'Pharmacie', category_id: 6, amount: -18.6, description: '' },
    { label: 'Virement épargne', category_id: 10, amount: -200, description: '' },
    { label: 'Remboursement mutuelle', category_id: 6, amount: 34.2, description: '' },
    { label: 'Achat en ligne', category_id: null, amount: -27.99, description: 'À classer' },
  ];

/**
 * Enough entries per account to exercise pagination and virtual scrolling —
 * one system entry plus a few hundred spread backwards day by day.
 */
function seed(accountId: number): Entry[] {
  const entries: Entry[] = [
    {
      id: accountId * 10_000,
      account_id: accountId,
      label: '',
      category_id: null,
      date: '2025-01-01',
      amount: 500,
      description: '',
      is_system: true,
      reconciled: false,
    },
  ];

  for (let index = 0; index < 240; index += 1) {
    const template = LABELS[index % LABELS.length];
    entries.push({
      id: accountId * 10_000 + index + 1,
      account_id: accountId,
      ...template,
      date: toIsoDate(new Date(2026, 6, 31 - index * 2)),
      is_system: false,
      reconciled: index % 3 === 0,
    });
  }

  return entries;
}

/** The subset of `Entry` an `EntryInput` sets, on create and on update alike. */
function fields(
  input: EntryInput,
): Pick<Entry, 'label' | 'category_id' | 'date' | 'amount' | 'description'> {
  return {
    label: input.label.trim(),
    category_id: input.category_id,
    date: input.date,
    amount: input.amount,
    description: input.description,
  };
}

/** Mirrors what `usecases::entry` rejects, so the mock UI hits the same toasts. */
function validate(input: EntryInput): { kind: string } | null {
  if (input.label.trim() === '') {
    return { kind: 'EmptyLabel' };
  }
  const cents = input.amount * 100;
  if (!Number.isFinite(cents) || Math.abs(cents - Math.round(cents)) > 1e-6) {
    return { kind: 'InvalidAmount' };
  }
  return null;
}

/**
 * In-memory stand-in for `EntriesApi`, activated by `--configuration mock`
 * (see `src/app/app.config.ts`) so the entries screen can be exercised in a
 * plain browser via `npm run start:mock`. Reproduces the backend's contract:
 * the system entry survives the date-range filter, ties break on id, and
 * `has_more` reports whether another page follows.
 */
export class InMemoryEntriesApi implements EntriesApi {
  private readonly byAccount = new Map<number, Entry[]>();

  listEntries(accountId: number, query: ListEntriesQuery): Promise<EntryPage> {
    const matching = this.entriesFor(accountId)
      .filter(
        (entry) =>
          entry.is_system ||
          ((query.from === null || entry.date >= query.from) &&
            (query.to === null || entry.date <= query.to) &&
            (!query.unreconciled_only || !entry.reconciled)),
      )
      .sort((a, b) => {
        const order = a.date.localeCompare(b.date) || a.id - b.id;
        return query.sort === 'ASC' ? order : -order;
      });

    const offset = query.jump_to_date === null ? query.offset : this.offsetFor(matching, query);

    return Promise.resolve({
      entries: matching.slice(offset, offset + query.page_size),
      has_more: matching.length > offset + query.page_size,
    });
  }

  createEntry(accountId: number, input: EntryInput): Promise<Entry> {
    const invalid = validate(input);
    if (invalid) {
      return Promise.reject(invalid);
    }

    const entries = this.entriesFor(accountId);
    const created: Entry = {
      id: Math.max(...entries.map((entry) => entry.id)) + 1,
      account_id: accountId,
      ...fields(input),
      is_system: false,
      reconciled: false,
    };
    entries.push(created);
    return Promise.resolve({ ...created });
  }

  updateEntry(id: number, input: EntryInput): Promise<Entry> {
    const invalid = validate(input);
    if (invalid) {
      return Promise.reject(invalid);
    }

    return this.mutate(id, (entry) => Object.assign(entry, fields(input)));
  }

  deleteEntry(id: number): Promise<void> {
    for (const entries of this.byAccount.values()) {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index === -1) {
        continue;
      }
      if (entries[index].is_system) {
        return Promise.reject({ kind: 'SystemEntryReadOnly' });
      }
      entries.splice(index, 1);
      return Promise.resolve();
    }
    return Promise.reject({ kind: 'NotFound' });
  }

  setReconciled(id: number, reconciled: boolean): Promise<Entry> {
    return this.mutate(id, (entry) => {
      entry.reconciled = reconciled;
    });
  }

  /** Applies a change to a non-system entry, rejecting the way the backend does. */
  private mutate(id: number, change: (entry: Entry) => void): Promise<Entry> {
    for (const entries of this.byAccount.values()) {
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry) {
        continue;
      }
      if (entry.is_system) {
        return Promise.reject({ kind: 'SystemEntryReadOnly' });
      }
      change(entry);
      return Promise.resolve({ ...entry });
    }
    return Promise.reject({ kind: 'NotFound' });
  }

  private offsetFor(matching: Entry[], query: ListEntriesQuery): number {
    const target = query.jump_to_date ?? '';
    const index = matching.findIndex((entry) =>
      query.sort === 'DESC' ? entry.date <= target : entry.date >= target,
    );
    return index === -1 ? matching.length : index;
  }

  private entriesFor(accountId: number): Entry[] {
    const existing = this.byAccount.get(accountId);
    if (existing) {
      return existing;
    }
    const created = seed(accountId);
    this.byAccount.set(accountId, created);
    return created;
  }
}
