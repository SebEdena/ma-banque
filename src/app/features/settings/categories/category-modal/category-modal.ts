import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import {
  CategoriesApi,
  Category,
  CategoryInput,
  parseCategoryError,
} from '@core/categories-api/categories-api';
import { ModalShell } from '@shared/modal-shell/modal-shell';
import { ColorPicker } from '@shared/pickers/color-picker/color-picker';
import { DEFAULT_COLOR } from '@shared/pickers/color-swatches';
import { provideCatalogIcons } from '@shared/pickers/icon-catalog';
import { IconPicker } from '@shared/pickers/icon-picker/icon-picker';

/**
 * The one create/edit category form, matching the prototype's "Nouveau
 * poste" / "Modifier le poste". The icon starts unset on creation rather
 * than on a default, so the user has to make a deliberate choice — which is
 * what makes "aucune icône sélectionnée" a validation state worth having
 * (`docs/spec/04-categories.md`).
 */
@Component({
  selector: 'app-category-modal',
  imports: [ReactiveFormsModule, ModalShell, IconPicker, ColorPicker, NgIcon, ...HlmButtonImports],
  providers: [provideCatalogIcons()],
  templateUrl: './category-modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryModal implements OnInit {
  private readonly categoriesApi = inject(CategoriesApi);

  /** The category being edited, or `null` to create a new one. */
  readonly category = input<Category | null>(null);

  readonly cancelled = output<void>();
  readonly saved = output<Category>();

  protected readonly editing = computed(() => this.category() !== null);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);

  protected readonly icon = signal<string | null>(null);
  protected readonly color = signal(DEFAULT_COLOR);

  protected readonly showIconError = computed(() => this.icon() === null && this.submitted());

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, nonBlank],
    }),
    description: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    const category = this.category();
    if (category === null) {
      return;
    }

    this.form.setValue({ name: category.name, description: category.description });
    this.icon.set(category.icon);
    this.color.set(category.color);
  }

  protected showNameError(): boolean {
    const name = this.form.controls.name;
    return name.invalid && (name.touched || this.submitted());
  }

  protected async save(): Promise<void> {
    this.submitted.set(true);
    const icon = this.icon();
    if (this.form.invalid || icon === null || this.saving()) {
      return;
    }

    const { name, description } = this.form.getRawValue();
    const input: CategoryInput = { name, color: this.color(), icon, description };

    this.saving.set(true);
    try {
      const category = this.category();
      this.saved.emit(
        category === null
          ? await this.categoriesApi.createCategory(input)
          : await this.categoriesApi.updateCategory(category.id, input),
      );
    } catch (error) {
      toast.error(parseCategoryError(error));
    } finally {
      this.saving.set(false);
    }
  }
}

/** Rejects a name that is only whitespace, which `Validators.required` accepts. */
function nonBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() === '' ? { required: true } : null;
}
