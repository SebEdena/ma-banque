import { Directive, ElementRef, inject } from '@angular/core';

/**
 * What an amount field accepts *while being typed* — deliberately looser than
 * `parseAmount`, so in-progress text (`-`, `12,`) survives the keystroke that
 * creates it. Spaces are allowed so an amount pasted in fr-FR display form
 * ("1 234,56") isn't rejected character by character.
 *
 * Decimal places are NOT capped: sub-cent precision is `money::to_cents`'
 * rule, raised as a toast by the backend, and `docs/spec/06-entries.md` is
 * explicit that the frontend keeps no second copy of it.
 */
const AMOUNT_TYPING = /^-?[\d\s]*(?:[.,][\d\s]*)?$/;

/** Text that reads as a signed major-unit amount, in either separator. */
const AMOUNT_VALUE = /^-?\d+(?:[.,]\d+)?$/;

/**
 * The amount field's text as the signed major-unit number to send, or `null`
 * when it isn't one — including when only the sign has been picked. What
 * `money::to_cents` would reject on the far side (sub-cent precision
 * especially) is left for it to reject, so both paths say the same thing.
 */
export function parseAmount(text: string): number | null {
  // `\s` covers U+202F, the narrow no-break space fr-FR uses for thousands.
  const raw = text.replace(/\s/g, '');
  return AMOUNT_VALUE.test(raw) ? Number(raw.replace(',', '.')) : null;
}

/**
 * `parseAmount`'s inverse: seeds the field with text a comma-typing user
 * recognizes as their own, for when an existing entry is opened for editing.
 * Plain `String()` always prints JS's own `.` decimal, which would fight the
 * comma this field otherwise accepts and jar against the fr-FR `,` the
 * read-only row just showed for the same value.
 */
export function formatAmountInput(amount: number): string {
  return String(amount).replace('.', ',');
}

/**
 * Rewrites an amount field's text to carry the given sign — what the
 * Débit/Crédit selector is, in both `EntryForm` and `RecurringRuleForm`: a
 * view over the amount text's leading `-` rather than a second piece of
 * state. An empty field stays empty rather than becoming a bare `-`: a lone
 * sign character with no magnitude used to sit in the field un-selectable,
 * blocking typing for any caret placed before it, and made the toggle look
 * like it had "picked" a side before the user had entered anything. Shared
 * here — where `parseAmount`/`formatAmountInput` already live — rather than
 * as a directive: there's no DOM/host behavior to attach, just a pure
 * rewrite of text the caller already owns as a signal, so a plain function
 * is the shallower fit.
 */
export function withDebitSign(amountText: string, debit: boolean): string {
  const magnitude = amountText.trim().replace(/^-/, '');
  return magnitude === '' ? magnitude : debit ? `-${magnitude}` : magnitude;
}

/**
 * Whether the Débit/Crédit selector should read as débit. While the amount
 * has a magnitude its sign is the only source of truth (`withDebitSign`'s
 * doc comment). While it doesn't, there is no sign to read — but the toggle
 * still has to answer *something*, and "always crédit" was the earlier bug:
 * clicking Débit on an empty field wrote no sign (correctly, per
 * `withDebitSign`) and so visibly did nothing, which read as the button
 * being unselectable. `pendingDebit` is the component's own signal recording
 * the last explicit click made while the field had no magnitude — it has no
 * effect on what gets saved (an empty amount is invalid regardless) or on
 * the field's text until a digit gives the sign somewhere to attach, via
 * `withPendingSign` below.
 */
export function isDebitSelected(amountText: string, pendingDebit: boolean): boolean {
  const magnitude = amountText.trim();
  return magnitude === '' ? pendingDebit : magnitude.startsWith('-');
}

/**
 * Carries a `pendingDebit` choice onto the first magnitude typed into a
 * field that was empty — the same "preselection" `withDebitSign`'s own doc
 * comment describes for the initial `-` on a fresh débit row, generalized to
 * a later click. Leaves `nextText` untouched once the field already has a
 * magnitude of its own: from then on the text is the only source of the
 * sign again, same as `withDebitSign`.
 */
export function withPendingSign(
  previousText: string,
  nextText: string,
  pendingDebit: boolean,
): string {
  if (previousText.trim() !== '' || !pendingDebit) {
    return nextText;
  }
  return withDebitSign(nextText, true);
}

/**
 * Constrains a plain `<input>` to amount text without owning its value —
 * `type="number"` can't render an in-progress amount (a lone `-`, `12,`
 * mid-decimal) since its value sanitization algorithm reads those back as
 * `""`, which is what used to force a whole side-channel of signals just to
 * keep the field and its draft in sync. Filtering happens on `beforeinput` so
 * the browser keeps the caret position and undo stack itself — rewriting
 * `value` after the fact would send the caret to the end mid-edit.
 */
@Directive({
  selector: 'input[appAmountInput]',
  host: {
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    '(beforeinput)': 'onBeforeInput($event)',
  },
})
export class AmountInput {
  private readonly field = inject<ElementRef<HTMLInputElement>>(ElementRef);

  protected onBeforeInput(event: InputEvent): void {
    const inserted = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
    if (inserted === '') {
      return; // Deletions and composition ends are never blocked.
    }

    const input = this.field.nativeElement;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const next = input.value.slice(0, start) + inserted + input.value.slice(end);
    if (!AMOUNT_TYPING.test(next)) {
      event.preventDefault();
    }
  }
}
