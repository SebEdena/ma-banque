# 04 — E2E: reconciliation scenario

**What to build:** The end-to-end WebdriverIO scenario proving reconciliation works through the real app shell.

**Blocked by:** 03.

**Status:** done

- [x] `e2e/reconciliation.e2e.ts` exists, sharing the WDIO session per `technical-architecture.md` §2.3, asserting on real `data-testid` hooks:
  - [x] Open an account with entries, open the Pointage panel, confirm the list narrows to unreconciled entries.
  - [x] Set a statement date and a bank balance.
  - [x] Tick entries until the delta reaches zero and assert the verdict flips to the balanced state.
  - [x] Collapse the panel and confirm the full list is back, including the now-reconciled entries.
