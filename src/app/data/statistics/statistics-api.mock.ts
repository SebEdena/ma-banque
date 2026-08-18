import { CategoryBreakdownResponse, MonthBucketedResponse, StatisticsApi } from './statistics-api';

/**
 * In-memory stand-in for `StatisticsApi`, activated by `--configuration
 * mock` (see `src/app/app.config.ts`), matching `InMemoryAccountsApi` /
 * `InMemoryEntriesApi`. Seeded to line up with `InMemoryAccountsApi`'s
 * accounts (id 1 = "Compte Courant") and `InMemoryEntriesApi`'s entries so
 * the mock statistics screen shows a plausible breakdown out of the box.
 * Every period preset answers with the same fixed data — this is a display
 * fixture, not a real aggregation.
 */
export class InMemoryStatisticsApi implements StatisticsApi {
  categoryBreakdown(): Promise<CategoryBreakdownResponse> {
    return Promise.resolve({
      buckets: [
        {
          category_id: 1,
          name: 'Alimentation',
          color: '#10b981',
          icon: 'lucideShoppingCart',
          amount: 342.18,
          percentage: 48.2,
        },
        {
          category_id: 2,
          name: 'Transport',
          color: '#6366f1',
          icon: 'lucideCar',
          amount: 189.5,
          percentage: 26.7,
        },
        {
          category_id: 3,
          name: 'Loisirs',
          color: '#f59e0b',
          icon: 'lucideGamepad2',
          amount: 98.4,
          percentage: 13.9,
        },
        {
          category_id: null,
          name: 'Sans poste',
          color: '#9ca3af',
          icon: '',
          amount: 79.3,
          percentage: 11.2,
        },
      ],
      total_expenses: 709.38,
    });
  }

  monthBucketed(): Promise<MonthBucketedResponse> {
    return Promise.resolve({
      months: [
        { month: '2026-05', income: 2400, expense: 1850.4 },
        { month: '2026-06', income: 2400, expense: 2010.15 },
        { month: '2026-07', income: 2450, expense: 1709.38 },
      ],
    });
  }
}
