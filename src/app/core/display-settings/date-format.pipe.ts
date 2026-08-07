import { Pipe, PipeTransform } from '@angular/core';

import type { DateFormat } from './display-settings.types';
import { formatDate } from './format';

/** Template-facing wrapper around `formatDate` — see that function for the contract. */
@Pipe({ name: 'dateFormat' })
export class DateFormatPipe implements PipeTransform {
  transform(date: Date, format: DateFormat): string {
    return formatDate(date, format);
  }
}
