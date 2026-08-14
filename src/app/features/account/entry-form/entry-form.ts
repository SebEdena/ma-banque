import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideX } from '@ng-icons/lucide';

import { Category } from '@core/categories-api/categories-api';
import { provideCatalogIcons } from '@shared/pickers/icon-catalog';
import { RowCategory, UNCATEGORIZED } from '../row-category';

/**
 * What the inline row form edits. `amount` is the field's **raw text, sign
 * included** — the debit/credit selector is a view over that sign rather
 * than a second piece of state, so the two can't drift apart
 * (`docs/spec/06-entries.md`). Turning it into the number to send is the
 * container's job, since rejecting it is a toast.
 */
export interface EntryDraft {
  label: string;
  description: string;
  date: string;
  categoryId: number | null;
  amount: string;
}

/**
 * The category select's quick-create option. A sentinel option rather than a
 * button beside the field: the select is native precisely because a floating
 * panel would be clipped by the virtual-scroll viewport's overflow, and an
 * extra option keeps the affordance where the user is already looking.
 */
export const NEW_CATEGORY_VALUE = '__new__';

/**
 * The inline entry form, rendered in the creation row above the list and in
 * place of an edited row — one component instantiated twice rather than two
 * markups to keep in step. Only ever one at a time: the container's
 * `editing` signal is a single target.
 *
 * Presentational: it edits the `draft` model and emits intents. `reconciled`
 * is an input rather than part of the draft because on an existing entry the
 * checkbox goes straight to `set_reconciled` instead of through the save
 * button — which is the container's call to make, not this component's.
 */
@Component({
  selector: 'app-entry-form',
  imports: [NgIcon],
  templateUrl: './entry-form.html',
  styles: ':host { display: contents; }',
  styleUrl: '../accent.css',
  providers: [provideCatalogIcons(), provideIcons({ lucideCheck, lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryForm {
  readonly draft = model.required<EntryDraft>();
  readonly categories = input.required<Category[]>();
  readonly accountColor = input.required<string>();
  readonly reconciled = input.required<boolean>();
  readonly saving = input(false);
  readonly labelError = input(false);

  readonly saved = output<void>();
  readonly cancelled = output<void>();
  readonly reconciledToggled = output<void>();
  readonly categoryCreateRequested = output<void>();

  protected readonly newCategoryValue = NEW_CATEGORY_VALUE;

  protected readonly isDebit = computed(() => this.draft().amount.trim().startsWith('-'));

  /** The swatch shown next to the category select. */
  protected readonly categorySwatch = computed<RowCategory>(() => {
    const id = this.draft().categoryId;
    return (
      (id === null ? undefined : this.categories().find((candidate) => candidate.id === id)) ??
      UNCATEGORIZED
    );
  });

  protected setCategory(select: HTMLSelectElement): void {
    if (select.value === NEW_CATEGORY_VALUE) {
      // The option is a trigger, not a value: the field goes back to showing
      // what it did, so cancelling the modal doesn't leave it on a
      // non-category. A save moves it on through the draft.
      select.value = String(this.draft().categoryId ?? '');
      this.categoryCreateRequested.emit();
      return;
    }
    this.patch({ categoryId: select.value === '' ? null : Number(select.value) });
  }

  /** Rewrites the amount's sign, which is all the debit/credit selector is. */
  protected setDebit(debit: boolean): void {
    const magnitude = this.draft().amount.trim().replace(/^-/, '');
    this.patch({ amount: debit ? `-${magnitude}` : magnitude });
  }

  protected patch(changes: Partial<EntryDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }));
  }
}
