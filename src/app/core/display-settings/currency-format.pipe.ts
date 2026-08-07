import { Pipe, PipeTransform } from '@angular/core';

import type { CurrencyFormat } from './display-settings.types';
import { formatAmount } from './format';

/** Template-facing wrapper around `formatAmount` — see that function for the contract. */
@Pipe({ name: 'currencyFormat' })
export class CurrencyFormatPipe implements PipeTransform {
  transform(amount: number, format: CurrencyFormat): string {
    return formatAmount(amount, format);
  }
}
