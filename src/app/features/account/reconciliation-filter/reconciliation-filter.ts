import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';

/**
 * The "Inclure lignes pointées" checkbox pushed to the far right of the
 * Pointage strip (business requirements §4.3): ticked by default so
 * already-reconciled entries stay visible, and the one control in the panel
 * that narrows the register rather than just describing it.
 *
 * Presentational, like its sibling `ReconciliationPanel`: it owns no state of
 * its own and reports only that it was clicked — `Account` decides what
 * ticking it does to the query, and `ReconciliationPanel` decides when it's
 * disabled (`unreconciled_count === 0`).
 */
@Component({
  selector: 'app-reconciliation-filter',
  imports: [NgIcon],
  templateUrl: './reconciliation-filter.html',
  providers: [provideIcons({ lucideCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReconciliationFilter {
  readonly checked = input.required<boolean>();
  readonly disabled = input.required<boolean>();
  readonly accountColor = input.required<string>();

  readonly toggled = output<void>();
}
