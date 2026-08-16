import { Service } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

/**
 * Mirrors `CategoryView` in `src-tauri/src/commands/category.rs` —
 * snake_case on the wire, like `Account`. `icon` is an ng-icons name from
 * `ICON_CATALOG` and `color` a hex swatch from `COLOR_SWATCHES`, including
 * the seeded twelve: the pickers only render what they know.
 */
export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string;
  /** Empty when the user left it blank, never null. */
  description: string;
  /** How many entries reference this category — what the delete flow branches on. */
  usage_count: number;
}

/** The create/edit modal's form, as `create_category`/`update_category` take it. */
export interface CategoryInput {
  name: string;
  color: string;
  icon: string;
  description: string;
}

/**
 * Wraps `invoke()` for the category Tauri commands so components never call
 * `invoke()` directly — the seam this feature's tests mock, matching
 * `AccountsApi` and `SettingsApi`.
 */
@Service()
export class CategoriesApi {
  listCategories(): Promise<Category[]> {
    return invoke<Category[]>('list_categories');
  }

  createCategory(input: CategoryInput): Promise<Category> {
    return invoke<Category>('create_category', { input });
  }

  updateCategory(id: number, input: CategoryInput): Promise<Category> {
    return invoke<Category>('update_category', { id, input });
  }

  deleteCategory(id: number): Promise<void> {
    return invoke<void>('delete_category', { id });
  }
}

/**
 * The `kind` discriminants `CategoryError` serializes to (see
 * `src-tauri/src/domain/category.rs`'s `#[serde(tag = "kind", content =
 * "message")]`).
 */
type CategoryErrorKind = 'NotFound' | 'EmptyName' | 'EmptyIcon' | 'InUse' | 'Io';

interface CategoryErrorWire {
  kind: CategoryErrorKind;
  message?: string;
}

function isCategoryErrorWire(error: unknown): error is CategoryErrorWire {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    typeof (error as { kind: unknown }).kind === 'string'
  );
}

/**
 * Turns a rejected `CategoryError` into the toast text to show, matching
 * `parseAccountError` — the backend stays English and the UI owns its own
 * wording. `EmptyName`/`EmptyIcon` are the backstop behind the modal's
 * inline validation, so they should never be seen in practice.
 */
export function parseCategoryError(error: unknown): string {
  if (!isCategoryErrorWire(error)) {
    return "une erreur inattendue s'est produite";
  }

  switch (error.kind) {
    case 'NotFound':
      return "ce poste n'existe plus";
    case 'EmptyName':
      return 'le nom du poste ne peut pas être vide';
    case 'EmptyIcon':
      return 'un poste doit avoir une icône';
    case 'InUse':
      return 'ce poste est utilisé par des écritures et ne peut pas être supprimé';
    case 'Io':
      return error.message ?? 'une erreur du système de fichiers est survenue';
    default:
      return "une erreur inattendue s'est produite";
  }
}
