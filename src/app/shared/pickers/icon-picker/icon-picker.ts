import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSearch } from '@ng-icons/lucide';

import { provideCatalogIcons, searchIcons } from '../icon-catalog';

/**
 * A searchable grid of the icons in `ICON_CATALOG`. Shared rather than
 * account-specific: the categories panel uses the same control, so both
 * screens offer the same icons under the same French keywords.
 */
@Component({
  selector: 'app-icon-picker',
  imports: [NgIcon],
  templateUrl: './icon-picker.html',
  providers: [provideCatalogIcons(), provideIcons({ lucideSearch })],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconPicker {
  readonly value = input<string | null>(null);
  readonly selected = output<string>();

  protected readonly query = signal('');
  protected readonly icons = computed(() => searchIcons(this.query()));

  protected search(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
