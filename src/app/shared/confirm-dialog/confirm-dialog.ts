import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import { ModalShell } from '@shared/modal-shell/modal-shell';

/**
 * A yes/no confirmation for an action that can't be undone. The `message` is
 * the caller's to write, so it can name the thing being acted on — a generic
 * "Êtes-vous sûr ?" is exactly what this is meant to avoid.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [ModalShell, ...HlmButtonImports],
  template: `
    <app-modal-shell
      labelledBy="confirm-dialog-title"
      panelClass="max-w-sm"
      (dismissed)="cancelled.emit()"
    >
      <h2 id="confirm-dialog-title" class="mb-2 text-[15px] font-bold">{{ title() }}</h2>
      <p class="mb-4 text-sm text-muted-foreground">{{ message() }}</p>

      <div class="flex justify-end gap-2">
        <button
          hlmBtn
          type="button"
          variant="outline"
          data-testid="confirm-cancel"
          (click)="cancelled.emit()"
        >
          Annuler
        </button>
        <button
          hlmBtn
          type="button"
          variant="destructive"
          data-testid="confirm-accept"
          (click)="confirmed.emit()"
        >
          {{ confirmLabel() }}
        </button>
      </div>
    </app-modal-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Confirmer');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
