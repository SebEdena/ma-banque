import { $ } from '@wdio/globals';

/** The `<div data-testid="category-card">` whose visible name is `name`. */
export function categoryCard(name: string) {
  return $(`//div[@data-testid="category-card"][.//div[normalize-space(text())="${name}"]]`);
}
