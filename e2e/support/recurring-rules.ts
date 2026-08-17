import { $, browser } from '@wdio/globals';

/**
 * Dismisses the rules modal with Escape, from the list state.
 *
 * The key has to land on a node inside the panel: `ModalShell` listens for it
 * on its backdrop, and the save that precedes this re-renders the list, so
 * the button that had focus is gone and focus has fallen back to `<body>` —
 * where the event never reaches that handler. Clicking the backdrop is the
 * other way out, but WebDriver clicks an element's centre, which is the panel.
 */
export async function dismissRulesModal(): Promise<void> {
  await browser.execute(() => {
    document.querySelector<HTMLElement>('[data-testid="recurring-new"]')?.focus();
  });
  await browser.keys('Escape');
}

function rowPath(label: string): string {
  return `//li[@data-testid="recurring-row"][.//span[@data-testid="recurring-row-label"][normalize-space(text())="${label}"]]`;
}

/**
 * A node inside the rule row whose visible label is `label`, addressed as one
 * selector rather than a chain off the row. Every successful write refetches
 * the list, and an element resolved against the pre-refetch DOM goes stale;
 * a single selector is re-queried on each poll instead.
 */
export function ruleRowPart(label: string, testId: string) {
  return $(`${rowPath(label)}//*[@data-testid="${testId}"]`);
}

/**
 * The same node, narrowed to one whose text contains `text`, so the match is
 * asserted with `toExist` rather than by reading the element's text back.
 * WebDriver's `getText` returns *rendered* text, which comes back empty under
 * WebKitWebDriver for anything the window did not lay out — `entries.e2e.ts`
 * matches its category cell through the same predicate for that reason.
 */
export function ruleRowPartContaining(label: string, testId: string, text: string) {
  return $(`${rowPath(label)}//*[@data-testid="${testId}"][contains(., "${text}")]`);
}

/**
 * Sets a native `<input type="date">` from a `YYYY-MM-DD` string. Typing into
 * one drives its locale-formatted day/month/year segments rather than its
 * value, so writing the value and raising the `input` event the component
 * listens for is the only reliable way in.
 */
export async function setDateInput(testId: string, isoDate: string): Promise<void> {
  await browser.execute(
    (id: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(`[data-testid="${id}"]`);
      if (input === null) {
        throw new Error(`No date input carries data-testid="${id}"`);
      }
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    testId,
    isoDate,
  );
}

/**
 * The first day of the month `count` months before the current one, as
 * `YYYY-MM-DD`. Anchoring the scenario's rule on a first-of-month keeps the
 * occurrence count exact whatever day the suite runs: a monthly rule started
 * on the 1st of month M-3 is due on the 1st of M-3, M-2, M-1 and M, and the
 * last of those has always passed by the time the run happens.
 */
export function firstOfMonthsAgo(count: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - count, 1);
  const month = String(target.getMonth() + 1).padStart(2, '0');
  return `${target.getFullYear()}-${month}-01`;
}
