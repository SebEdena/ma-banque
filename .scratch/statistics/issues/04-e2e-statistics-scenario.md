# 04 — E2E: statistics scenario

**What to build:** The end-to-end WebdriverIO scenario proving the statistics screen works through the real app shell.

**Blocked by:** 03.

**Status:** ready-for-agent

- [ ] `e2e/statistics.e2e.ts` exists, sharing the WDIO session per `technical-architecture.md` §2.3, asserting on `data-testid` hooks:
  - [ ] From an account with entries created by the test setup, open the statistics screen via the account header button and assert both charts render with data.
  - [ ] Switch the period preset and assert the charts update.
  - [ ] Switch to another account via the pills and assert the charts update to that account's data.
  - [ ] Return to the register via "Voir le compte".
