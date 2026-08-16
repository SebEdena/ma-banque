import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucidePencil, lucidePlus, lucideTrash2 } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import { Category, CategoryInput, parseCategoryError } from '@data/categories/categories-api';
import { CategoriesStore } from '@data/categories/categories-store';
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
  private readonly categoriesStore = inject(CategoriesStore);

  protected readonly categories = this.categoriesStore.categories;

  /** The category the modal is editing, `null` for a create, `undefined` when closed. */
  protected readonly editing = signal<Category | null | undefined>(undefined);
  protected readonly saving = signal(false);
  protected readonly confirmingDelete = signal<Category | null>(null);
  protected readonly deleteBlocked = signal<Category | null>(null);

  constructor() {
    // `usage_count` only changes on the store's own writes (create/update/
    // delete), not when an entry elsewhere starts or stops referencing a
    // category — refresh on entering this screen so the delete gate isn't
    // deciding off a stale count.
    this.categoriesStore.reload().catch((error: unknown) => {
      console.error('failed to reload categories', error);
    });
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

  /**
   * Saves what the modal found valid. The modal only validates and builds
   * the input (`CategoryModal`, presentational); this container decides
   * create vs. update off the category it's already holding, owns the
   * backend call, and keeps the modal open on rejection.
   */
  protected async onCategorySubmitted(input: CategoryInput): Promise<void> {
    const target = this.editing();
    if (target === undefined || this.saving()) {
      return;
    }

    this.saving.set(true);
    try {
      if (target === null) {
        await this.categoriesStore.create(input);
      } else {
        await this.categoriesStore.update(target.id, input);
      }
      this.closeModal();
    } catch (error) {
      toast.error(parseCategoryError(error));
    } finally {
      this.saving.set(false);
    }
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
      await this.categoriesStore.delete(category.id);
    } catch (error) {
      toast.error(parseCategoryError(error));
      // The store's delete only reloads on success — refresh here too, in
      // case the rejection (a stale usage count) means the list itself is
      // now stale.
      await this.categoriesStore.reload();
    }
  }

  /** The blocked message's "utilisé par N écriture(s)", agreeing in number. */
  protected usageLabel(category: Category): string {
    return category.usage_count === 1 ? '1 écriture' : `${category.usage_count} écritures`;
  }
}
