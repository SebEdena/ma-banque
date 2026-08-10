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
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import { Account, AccountInput, parseAccountError } from '@core/accounts-api/accounts-api';
import { AccountsStore } from '@core/accounts-api/accounts-store';
import { ModalShell } from '@shared/modal-shell/modal-shell';
import { ColorPicker } from '@shared/pickers/color-picker/color-picker';
import { DEFAULT_COLOR } from '@shared/pickers/color-swatches';
import { IconPicker } from '@shared/pickers/icon-picker/icon-picker';
import { DEFAULT_ICON_NAME } from '@shared/pickers/icon-catalog';

/** Today as the `YYYY-MM-DD` the backend and `<input type="date">` both speak. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The one create/edit account form, matching the prototype's "Nouveau
 * compte" / "Paramètres du compte" — the same component in both modes, opened
 * from the home screen today and from the entries screen's "Paramètres"
 * button once `06-entries.md` lands. Deliberately a modal rather than a
 * route, and deliberately carries **no delete action**: deleting only ever
 * happens from the archived-accounts view.
 */
@Component({
  selector: 'app-account-settings-modal',
  imports: [ReactiveFormsModule, ModalShell, IconPicker, ColorPicker, ...HlmButtonImports],
  templateUrl: './account-settings-modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSettingsModal implements OnInit {
  private readonly accounts = inject(AccountsStore);

  /** The account being edited, or `null` to create a new one. */
  readonly account = input<Account | null>(null);

  readonly cancelled = output<void>();
  readonly saved = output<Account>();

  protected readonly editing = computed(() => this.account() !== null);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);

  protected readonly icon = signal(DEFAULT_ICON_NAME);
  protected readonly color = signal(DEFAULT_COLOR);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, nonBlank],
    }),
    // The typed major-unit value, handed to Rust exactly as entered — the
    // f64-to-cents rounding is Rust's decision to make, not ours
    // (technical-architecture.md §1.3). Negative is allowed on purpose: an
    // account can open overdrawn, and the backend turns a negative opening
    // balance into a DEBIT system entry.
    openingBalance: new FormControl<number | null>(0, {
      validators: [Validators.required],
    }),
    createdDate: new FormControl(today(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  ngOnInit(): void {
    const account = this.account();
    if (account === null) {
      return;
    }

    this.form.setValue({
      name: account.name,
      openingBalance: account.opening_balance,
      createdDate: account.created_date,
    });
    this.icon.set(account.icon);
    this.color.set(account.color);
  }

  protected showError(field: 'name' | 'openingBalance' | 'createdDate'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitted());
  }

  protected async save(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid || this.saving()) {
      return;
    }

    const { name, openingBalance, createdDate } = this.form.getRawValue();
    const input: AccountInput = {
      name,
      color: this.color(),
      icon: this.icon(),
      created_date: createdDate,
      opening_balance: openingBalance as number,
    };

    this.saving.set(true);
    try {
      const account = this.account();
      this.saved.emit(
        account === null
          ? await this.accounts.create(input)
          : await this.accounts.update(account.id, input),
      );
    } catch (error) {
      toast.error(parseAccountError(error));
    } finally {
      this.saving.set(false);
    }
  }
}

/** Rejects a name that is only whitespace, which `Validators.required` accepts. */
function nonBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() === '' ? { required: true } : null;
}
