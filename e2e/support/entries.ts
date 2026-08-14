import { $ } from '@wdio/globals';

/** The `<div data-testid="entry-row">` whose visible label is `label`. */
export function entryRow(label: string) {
  return $(
    `//div[@data-testid="entry-row"][.//span[@data-testid="entry-label"][normalize-space(text())="${label}"]]`,
  );
}

/** The entry form's category `<option>` named `name`. */
export function categoryOption(name: string) {
  return $(
    `//select[@data-testid="entry-form-category"]/option[normalize-space(text())="${name}"]`,
  );
}
