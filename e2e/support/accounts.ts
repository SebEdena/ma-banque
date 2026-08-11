import { $ } from '@wdio/globals';

/** The `<li data-testid="account-card">` whose visible name is `name`. */
export function accountCard(name: string) {
  return $(
    `//li[@data-testid="account-card"][.//a[@data-testid="account-link"][normalize-space(text())="${name}"]]`,
  );
}
