import { Component, input, output } from '@angular/core';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

export interface ToggleOption<T> {
  value: T;
  label: string;
  /** Shown as a tooltip on hover, in addition to the always-visible `label`. */
  tooltip?: string;
}

/**
 * A segmented pill group of mutually-exclusive options (used for the
 * date/currency format pickers). Renders plain `<button>`s rather than
 * `hlmBtn` so it can apply its own focus-visible/hover/active states
 * tailored to the pill layout — `hlmBtn`'s default variants target
 * standalone buttons, not a segmented group.
 */
@Component({
  selector: 'app-option-toggle-group',
  imports: [...HlmTooltipImports],
  templateUrl: './option-toggle-group.html',
})
export class OptionToggleGroup<T> {
  readonly options = input.required<ToggleOption<T>[]>();
  readonly active = input.required<T>();
  readonly optionSelected = output<T>();
}
