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
import { HlmButtonImports } from '@spartan-ng/helm/button';

import { Account, AccountInput } from '@data/accounts/accounts-api';
import { AmountInput, formatAmountInput, parseAmount } from '@shared/amount-input/amount-input';
import { todayIso } from '@shared/iso-date/iso-date';
import { ModalShell } from '@shared/modal-shell/modal-shell';
import { ColorPicker } from '@shared/pickers/color-picker/color-picker';
import { DEFAULT_COLOR } from '@shared/pickers/color-swatches';
import { IconPicker } from '@shared/pickers/icon-picker/icon-picker';
import { DEFAULT_ICON_NAME } from '@shared/pickers/icon-catalog';

/**
 * The one create/edit account form, matching the prototype's "Nouveau
 * compte" / "Paramètres du compte" — the same component in both modes, opened
 * from the home screen today and from the entries screen's "Paramètres"
 * button once `06-entries.md` lands. Deliberately a modal rather than a
 * route, and deliberately carries **no delete action**: deleting only ever
 * happens from the archived-accounts view.
 *
 * Presentational: it validates the form and emits `submitted` with the
 * built `AccountInput` rather than calling `AccountsStore` itself — the
 * container decides create vs. update (it already holds the account being
 * edited), owns the backend call and its error toast, and passes `saving`
 * back down while the call is in flight. Mirrors the entries screen's
 * `EntryForm`/`Account` split.
 */
@Component({
  selector: 'app-account-settings-modal',
  imports: [
    ReactiveFormsModule,
    ModalShell,
    IconPicker,
    ColorPicker,
    AmountInput,
    ...HlmButtonImports,
  ],
  templateUrl: './account-settings-modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSettingsModal implements OnInit {
  /** The account being edited, or `null` to create a new one. */
  readonly account = input<Account | null>(null);
  readonly saving = input(false);

  readonly cancelled = output<void>();

  /** A save attempt on a valid form, carrying the input the container should save. */
  readonly submitted = output<AccountInput>();

  protected readonly editing = computed(() => this.account() !== null);
  protected readonly attempted = signal(false);

  protected readonly icon = signal(DEFAULT_ICON_NAME);
  protected readonly color = signal(DEFAULT_COLOR);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, nonBlank],
    }),
    // The field's raw text, mirroring the entry form's amount — see
    // `amount-input.ts`. Parsed to the major-unit value on save and handed
    // to Rust exactly as entered, since the f64-to-cents rounding is Rust's
    // decision to make, not ours (technical-architecture.md §1.3). Negative
    // is allowed on purpose: an account can open overdrawn, and the backend
    // turns a negative opening balance into a DEBIT system entry.
    openingBalance: new FormControl('0', {
      nonNullable: true,
      validators: [Validators.required, validAmount],
    }),
    createdDate: new FormControl(todayIso(), {
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
      openingBalance: formatAmountInput(account.opening_balance),
      createdDate: account.created_date,
    });
    this.icon.set(account.icon);
    this.color.set(account.color);
  }

  protected showError(field: 'name' | 'openingBalance' | 'createdDate'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.attempted());
  }

  protected trySave(): void {
    this.attempted.set(true);
    if (this.form.invalid) {
      return;
    }

    const { name, openingBalance, createdDate } = this.form.getRawValue();
    this.submitted.emit({
      name,
      color: this.color(),
      icon: this.icon(),
      created_date: createdDate,
      opening_balance: parseAmount(openingBalance) as number,
    });
  }
}

/** Rejects a name that is only whitespace, which `Validators.required` accepts. */
function nonBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() === '' ? { required: true } : null;
}

/** Rejects text `parseAmount` can't read as a signed major-unit amount. */
function validAmount(control: AbstractControl<string>): ValidationErrors | null {
  return parseAmount(control.value) === null ? { invalidAmount: true } : null;
}
