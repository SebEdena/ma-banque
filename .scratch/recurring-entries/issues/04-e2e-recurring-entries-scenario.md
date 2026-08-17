# 04 — E2E: recurring entries scenario

**What to build:** The end-to-end WebdriverIO scenario proving the feature works through the real app shell.

**Blocked by:** 02, 03.

**Status:** ready-for-agent

- [ ] `e2e/recurring-entries.e2e.ts` exists, sharing the WDIO session per `technical-architecture.md` §2.3 and picking up from `ensureRoutedShell()`, asserting on `data-testid` hooks:
  - [ ] Open an account, open the recurring rules modal from the account toolbar, create a monthly rule with a start date some months in the past, close the modal and confirm the backfilled entries are now in the register.
  - [ ] Reopen the modal, edit the rule's amount with the "next occurrence only" scope, and confirm the rule row still shows the original amount.
  - [ ] Delete the rule behind its confirmation and confirm the previously generated entries are still in the register.
- [ ] The startup sweep is not tested by restarting the app in this suite (the WDIO session shares one launch) — its own behaviour is left to ticket 02's use-case test; this ticket only needs to note that in the test file's comments.
