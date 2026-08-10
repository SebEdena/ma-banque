import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { COLOR_SWATCHES } from '../color-swatches';

/**
 * A single row of colour swatches (see `COLOR_SWATCHES`). Shared rather than
 * account-specific: the categories panel uses the same control, so the two
 * screens can never drift onto different palettes.
 */
@Component({
  selector: 'app-color-picker',
  templateUrl: './color-picker.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorPicker {
  readonly value = input<string | null>(null);
  readonly selected = output<string>();

  protected readonly swatches = COLOR_SWATCHES;
}
