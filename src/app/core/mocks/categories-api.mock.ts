import { Category, CategoriesApi, CategoryInput } from '@core/categories-api/categories-api';

/** The seeded twelve, already in `list_categories`' case- and accent-insensitive name order. */
const SEEDED: Category[] = [
  {
    id: 8,
    name: 'Abonnements',
    color: '#06b6d4',
    icon: 'lucideRepeat',
    description: 'Streaming, logiciels, presse',
    usage_count: 4,
  },
  {
    id: 1,
    name: 'Alimentation',
    color: '#10b981',
    icon: 'lucideShoppingCart',
    description: 'Courses, supermarché, marché',
    usage_count: 23,
  },
  {
    id: 12,
    name: 'Divers',
    color: '#64748b',
    icon: 'lucideEllipsis',
    description: 'Non catégorisé',
    usage_count: 0,
  },
  {
    id: 10,
    name: 'Épargne / Investissement',
    color: '#14b8a6',
    icon: 'lucidePiggyBank',
    description: "Virements vers l'épargne",
    usage_count: 2,
  },
  {
    id: 11,
    name: 'Impôts / Taxes',
    color: '#6366f1',
    icon: 'lucideLandmark',
    description: 'Impôts, taxes, cotisations',
    usage_count: 0,
  },
  {
    id: 2,
    name: 'Logement',
    color: '#3b82f6',
    icon: 'lucideHouse',
    description: 'Loyer, charges, assurance habitation',
    usage_count: 6,
  },
  {
    id: 5,
    name: 'Loisirs',
    color: '#a855f7',
    icon: 'lucidePartyPopper',
    description: 'Cinéma, sport, activités',
    usage_count: 0,
  },
  {
    id: 4,
    name: 'Restaurant / Sorties',
    color: '#ec4899',
    icon: 'lucideUtensils',
    description: 'Restaurants, cafés, bars',
    usage_count: 9,
  },
  {
    id: 9,
    name: 'Salaire',
    color: '#84cc16',
    icon: 'lucideBanknote',
    description: 'Revenus du travail',
    usage_count: 6,
  },
  {
    id: 6,
    name: 'Santé',
    color: '#ef4444',
    icon: 'lucideHeartPulse',
    description: 'Pharmacie, médecin, mutuelle',
    usage_count: 0,
  },
  {
    id: 7,
    name: 'Shopping / Habillement',
    color: '#eab308',
    icon: 'lucideShirt',
    description: 'Vêtements, accessoires',
    usage_count: 3,
  },
  {
    id: 3,
    name: 'Transport',
    color: '#f97316',
    icon: 'lucideCar',
    description: 'Essence, transports en commun, entretien',
    usage_count: 11,
  },
];

/**
 * In-memory stand-in for `CategoriesApi`, activated by `--configuration
 * mock` (see `src/app/app.config.ts`) so the Postes tab can be exercised in
 * a plain browser via `npm run start:mock`. Mutates its seed data in place
 * so create/edit/delete behave like the real thing across the session, and
 * keeps some categories at a zero usage count so both delete paths — the
 * confirm dialog and the blocked-with-count message — are reachable.
 */
export class InMemoryCategoriesApi implements CategoriesApi {
  private nextId = 13;

  private categories: Category[] = [...SEEDED];

  listCategories(): Promise<Category[]> {
    return Promise.resolve(this.sorted());
  }

  createCategory(input: CategoryInput): Promise<Category> {
    const created: Category = { ...input, id: this.nextId++, usage_count: 0 };
    this.categories = this.sorted([...this.categories, created]);
    return Promise.resolve(created);
  }

  updateCategory(id: number, input: CategoryInput): Promise<Category> {
    const updated: Category = { ...this.findOrThrow(id), ...input };
    this.categories = this.sorted(this.categories.map((c) => (c.id === id ? updated : c)));
    return Promise.resolve(updated);
  }

  deleteCategory(id: number): Promise<void> {
    const category = this.findOrThrow(id);
    if (category.usage_count > 0) {
      return Promise.reject({ kind: 'InUse' });
    }
    this.categories = this.categories.filter((c) => c.id !== id);
    return Promise.resolve();
  }

  /**
   * Mirrors the repository's `ORDER BY name COLLATE FRENCH_NOCASE, id` — the
   * custom collation in `infra/collation.rs` folds case *and* accents, which
   * `sensitivity: 'base'` is the browser's equivalent of.
   */
  private sorted(categories: Category[] = this.categories): Category[] {
    return [...categories].sort(
      (a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }) || a.id - b.id,
    );
  }

  private findOrThrow(id: number): Category {
    const category = this.categories.find((c) => c.id === id);
    if (!category) {
      throw { kind: 'NotFound' };
    }
    return category;
  }
}
