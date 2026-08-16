import { $ } from '@wdio/globals';

/** The `<div data-testid="entry-row">` whose visible label is `label`. */
export function entryRow(label: string) {
  return $(
    `//div[@data-testid="entry-row"][.//span[@data-testid="entry-label"][normalize-space(text())="${label}"]]`,
  );
}

/** The entry form's category picker option named `name`, once opened. */
export function categoryOption(name: string) {
  return $(`//*[@role="option"][.//span[normalize-space(text())="${name}"]]`);
}
