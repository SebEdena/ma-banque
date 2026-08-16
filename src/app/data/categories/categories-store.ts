import { Service, inject, signal } from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';

import { CategoriesApi, Category, CategoryInput, parseCategoryError } from './categories-api';

/**
 * Signal-backed source of truth for the category list, shared by every
 * surface that shows it — the entries screen's inline form and the Settings
 * "Postes" tab today. Both read the same signal rather than fetching
 * independently, matching `AccountsStore`'s reasoning: a category created or
 * edited on one surface is reflected on the other without either knowing the
 * other exists.
 */
@Service()
export class CategoriesStore {
  private readonly categoriesApi = inject(CategoriesApi);

  private readonly categoriesSignal = signal<Category[]>([]);

  readonly categories = this.categoriesSignal.asReadonly();

  /** Resolves once the initial load has settled, success or failure — see `AccountsStore.loaded`. */
  readonly loaded: Promise<void>;

  constructor() {
    this.loaded = this.reload().catch((error: unknown) => {
      console.error('failed to load categories', error);
      toast.error(parseCategoryError(error));
    });
  }

  async reload(): Promise<void> {
    this.categoriesSignal.set(await this.categoriesApi.listCategories());
  }

  async create(input: CategoryInput): Promise<Category> {
    const created = await this.categoriesApi.createCategory(input);
    await this.reload();
    return created;
  }

  async update(id: number, input: CategoryInput): Promise<Category> {
    const updated = await this.categoriesApi.updateCategory(id, input);
    await this.reload();
    return updated;
  }

  async delete(id: number): Promise<void> {
    await this.categoriesApi.deleteCategory(id);
    await this.reload();
  }
}
