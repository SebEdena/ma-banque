import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucidePencil, lucidePlus, lucideTrash2 } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import { CategoriesApi, Category, parseCategoryError } from '@core/categories-api/categories-api';
import { ConfirmDialog } from '@shared/confirm-dialog/confirm-dialog';
import { ModalShell } from '@shared/modal-shell/modal-shell';
import { provideCatalogIcons } from '@shared/pickers/icon-catalog';
import { CategoryModal } from './category-modal/category-modal';

/**
 * The Settings screen's "Postes" tab (`docs/spec/04-categories.md`): the
 * global category list as the prototype's card grid, with the create/edit
 * modal and the two-step delete behind it.
 *
 * Deletion asks `usage_count` rather than trying and catching: a category
 * entries still reference offers no delete action at all, instead of one
 * that always fails. The `InUse` toast is the backstop for the case the
 * count was stale — the backend, not this screen, is the authority.
 */
@Component({
  selector: 'app-categories',
  imports: [NgIcon, CategoryModal, ConfirmDialog, ModalShell, ...HlmButtonImports],
  providers: [
    provideCatalogIcons(),
    provideIcons({ lucidePlus, lucidePencil, lucideTrash2, lucideCircleAlert }),
  ],
  templateUrl: './categories.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Categories {
  private readonly categoriesApi = inject(CategoriesApi);

  protected readonly categories = signal<Category[]>([]);

  /** The category the modal is editing, `null` for a create, `undefined` when closed. */
  protected readonly editing = signal<Category | null | undefined>(undefined);
  protected readonly confirmingDelete = signal<Category | null>(null);
  protected readonly deleteBlocked = signal<Category | null>(null);

  constructor() {
    void this.load();
  }

  protected startCreate(): void {
    this.editing.set(null);
  }

  protected startEdit(category: Category): void {
    this.editing.set(category);
  }

  protected closeModal(): void {
    this.editing.set(undefined);
  }

  protected async onSaved(): Promise<void> {
    this.closeModal();
    await this.load();
  }

  protected startDelete(category: Category): void {
    if (category.usage_count > 0) {
      this.deleteBlocked.set(category);
      return;
    }
    this.confirmingDelete.set(category);
  }

  protected async confirmDelete(): Promise<void> {
    const category = this.confirmingDelete();
    if (category === null) {
      return;
    }

    this.confirmingDelete.set(null);
    try {
      await this.categoriesApi.deleteCategory(category.id);
    } catch (error) {
      toast.error(parseCategoryError(error));
    }
    await this.load();
  }

  /** The blocked message's "utilisé par N écriture(s)", agreeing in number. */
  protected usageLabel(category: Category): string {
    return category.usage_count === 1 ? '1 écriture' : `${category.usage_count} écritures`;
  }

  private async load(): Promise<void> {
    try {
      this.categories.set(await this.categoriesApi.listCategories());
    } catch (error) {
      toast.error(parseCategoryError(error));
    }
  }
}
