import { $, $$ } from '@wdio/globals';

function entryRowPath(label: string): string {
  return `//div[@data-testid="entry-row"][.//span[@data-testid="entry-label"][normalize-space(text())="${label}"]]`;
}

/** The `<div data-testid="entry-row">` whose visible label is `label`. */
export function entryRow(label: string) {
  return $(entryRowPath(label));
}

/** Every entry row labelled `label` — a recurring rule generates one per occurrence. */
export function entryRows(label: string) {
  return $$(entryRowPath(label));
}

/** The entry form's category picker option named `name`, once opened. */
export function categoryOption(name: string) {
  return $(`//*[@role="option"][.//span[normalize-space(text())="${name}"]]`);
}
