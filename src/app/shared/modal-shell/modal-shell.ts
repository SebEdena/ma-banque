import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * The chrome every modal in the app shares: a dimming backdrop, a focus trap,
 * and the two ways out that don't involve a button — Escape and a click on
 * the backdrop. Content is projected, so a modal only writes its own body.
 */
@Component({
  selector: 'app-modal-shell',
  imports: [A11yModule],
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="modal-backdrop"
      tabindex="-1"
      (click)="closeOnBackdrop($event)"
      (keydown.escape)="dismissed.emit()"
    >
      <div
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="labelledBy()"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        class="max-h-full w-full overflow-y-auto rounded-[14px] border border-border bg-card p-5 shadow-lg"
        [class]="panelClass()"
      >
        <ng-content />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalShell {
  /** Id of the heading inside the projected content that names this dialog. */
  readonly labelledBy = input.required<string>();
  readonly panelClass = input('max-w-md');

  readonly dismissed = output<void>();

  /**
   * Closes only on a click that landed on the backdrop itself — a click
   * inside the panel bubbles up to the same handler, and must not be
   * mistaken for a click outside.
   */
  protected closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.dismissed.emit();
    }
  }
}
