import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AmountInput, formatAmountInput, parseAmount } from './amount-input';

@Component({
  selector: 'app-amount-input-host',
  imports: [AmountInput],
  template: `<input appAmountInput data-testid="amount" [value]="value()" />`,
})
class AmountInputHost {
  readonly value = signal('');
}

function input(fixture: ComponentFixture<AmountInputHost>): HTMLInputElement {
  return (fixture.nativeElement as HTMLElement).querySelector(
    '[data-testid="amount"]',
  ) as HTMLInputElement;
}

/**
 * `beforeinput` carries the *would-be* insertion in `data`/`dataTransfer`
 * rather than a post-insertion `value` — jsdom doesn't apply it to the field
 * itself, so this mirrors what a real browser does before the directive gets
 * a chance to call `preventDefault()`: it puts the caret where requested and
 * splices `data` in, exactly as `AmountInput.onBeforeInput` expects to read it.
 */
function typeAt(field: HTMLInputElement, caret: number, data: string): boolean {
  field.setSelectionRange(caret, caret);
  const event = new InputEvent('beforeinput', { data, cancelable: true, bubbles: true });
  const notPrevented = field.dispatchEvent(event);
  if (notPrevented) {
    field.value = field.value.slice(0, caret) + data + field.value.slice(caret);
    field.setSelectionRange(caret + data.length, caret + data.length);
  }
  return notPrevented;
}

describe('AmountInput', () => {
  async function createHost(): Promise<ComponentFixture<AmountInputHost>> {
    await TestBed.configureTestingModule({ imports: [AmountInputHost] }).compileComponents();
    const fixture = TestBed.createComponent(AmountInputHost);
    fixture.detectChanges();
    return fixture;
  }

  it('renders as a plain text field with a decimal keyboard, not a spinner', async () => {
    const fixture = await createHost();
    const field = input(fixture);

    expect(field.type).toBe('text');
    expect(field.getAttribute('inputmode')).toBe('decimal');
    expect(field.getAttribute('autocomplete')).toBe('off');
  });

  it('accepts digits, both decimal separators, a leading sign, and spaces', async () => {
    const fixture = await createHost();
    const field = input(fixture);

    for (const [caret, data] of [
      [0, '-'],
      [1, '1'],
      [2, ' '],
      [3, '2'],
      [4, '3'],
      [5, '4'],
      [6, ','],
      [7, '5'],
      [8, '6'],
    ] as const) {
      expect(typeAt(field, caret, data)).toBe(true);
    }
    expect(field.value).toBe('-1 234,56');

    field.value = '';
    expect(typeAt(field, 0, '12.5')).toBe(true);
    expect(field.value).toBe('12.5');
  });

  it('rejects a keystroke that would leave the text unreadable as an amount, without moving the caret', async () => {
    const fixture = await createHost();
    const field = input(fixture);
    field.value = '12';
    field.setSelectionRange(2, 2);

    expect(typeAt(field, 2, 'a')).toBe(false);
    expect(field.value).toBe('12');
    expect(field.selectionStart).toBe(2);

    expect(typeAt(field, 2, ',')).toBe(true);
    expect(typeAt(field, 3, ',')).toBe(false);
    expect(field.value).toBe('12,');
  });

  it('never blocks deletion, even mid-way through an in-progress amount', async () => {
    const fixture = await createHost();
    const field = input(fixture);
    field.value = '-12,';
    field.setSelectionRange(4, 4);

    const event = new InputEvent('beforeinput', {
      inputType: 'deleteContentBackward',
      cancelable: true,
      bubbles: true,
    });
    expect(field.dispatchEvent(event)).toBe(true);
  });

  it('accepts a pasted, thousands-formatted amount as one insertion', async () => {
    const fixture = await createHost();
    const field = input(fixture);
    field.setSelectionRange(0, 0);

    // jsdom doesn't implement the `DataTransfer` global a real paste carries,
    // so this stands in for it — `AmountInput.onBeforeInput` only ever calls
    // `getData('text/plain')` on whatever `dataTransfer` holds.
    const event = new InputEvent('beforeinput', {
      inputType: 'insertFromPaste',
      cancelable: true,
      bubbles: true,
    });
    Object.defineProperty(event, 'dataTransfer', {
      value: { getData: () => '1 234,56' },
    });

    expect(field.dispatchEvent(event)).toBe(true);
  });
});

describe('parseAmount', () => {
  it('reads a signed major-unit number in either decimal separator', () => {
    expect(parseAmount('-12.4')).toBe(-12.4);
    expect(parseAmount('-12,4')).toBe(-12.4);
    expect(parseAmount('1 234,56')).toBe(1234.56);
  });

  it('rejects text that is not a plain signed decimal, including forms bare Number() would accept', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('-')).toBeNull();
    expect(parseAmount('12.')).toBeNull();
    expect(parseAmount('0x1A')).toBeNull();
    expect(parseAmount('1e5')).toBeNull();
    expect(parseAmount('Infinity')).toBeNull();
    expect(parseAmount('12,34,56')).toBeNull();
  });
});

describe('formatAmountInput', () => {
  it('prints the comma a French-notation user typed, not JS’s own dot', () => {
    expect(formatAmountInput(-25.5)).toBe('-25,5');
    expect(formatAmountInput(30)).toBe('30');
  });

  it('round-trips through parseAmount back to the same number', () => {
    expect(parseAmount(formatAmountInput(-25.5))).toBe(-25.5);
  });
});
