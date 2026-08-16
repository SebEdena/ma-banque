import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { HlmButtonImports } from '@spartan-ng/helm/button';

import { Category, CategoryInput } from '@core/categories-api/categories-api';
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
 *
 * Presentational: it validates the form and emits `submitted` with the
 * built `CategoryInput` rather than calling `CategoriesStore` itself — the
 * container decides create vs. update (it already holds the category being
 * edited), owns the backend call and its error toast, and passes `saving`
 * back down while the call is in flight. Mirrors the entries screen's
 * `EntryForm`/`Account` split.
 */
@Component({
  selector: 'app-category-modal',
  imports: [ReactiveFormsModule, ModalShell, IconPicker, ColorPicker, NgIcon, ...HlmButtonImports],
  providers: [provideCatalogIcons()],
  templateUrl: './category-modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryModal implements OnInit {
  /** The category being edited, or `null` to create a new one. */
  readonly category = input<Category | null>(null);
  readonly saving = input(false);

  readonly cancelled = output<void>();

  /** A save attempt on a valid form, carrying the input the container should save. */
  readonly submitted = output<CategoryInput>();

  protected readonly editing = computed(() => this.category() !== null);
  protected readonly attempted = signal(false);

  protected readonly icon = signal<string | null>(null);
  protected readonly color = signal(DEFAULT_COLOR);

  protected readonly showIconError = computed(() => this.icon() === null && this.attempted());

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
    return name.invalid && (name.touched || this.attempted());
  }

  protected trySave(): void {
    this.attempted.set(true);
    const icon = this.icon();
    if (this.form.invalid || icon === null) {
      return;
    }

    const { name, description } = this.form.getRawValue();
    this.submitted.emit({ name, color: this.color(), icon, description });
  }
}

/** Rejects a name that is only whitespace, which `Validators.required` accepts. */
function nonBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() === '' ? { required: true } : null;
}
