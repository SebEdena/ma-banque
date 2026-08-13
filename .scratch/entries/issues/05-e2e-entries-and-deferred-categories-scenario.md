# 05 — E2E: entries flows + deferred categories blocked-with-count scenario

**What to build:** The E2E coverage `docs/spec/06-entries.md`'s Testing Decisions section calls for, plus the "blocked-with-count" category delete scenario `04-categories.md`'s ticket 03 deferred here for lack of an entry to reference.

Scope, per `docs/spec/06-entries.md`:

- `e2e/entries.e2e.ts` (WebdriverIO): open an account from the home screen, create an entry via the inline row, edit it in place, toggle its reconciled checkbox, delete it behind confirmation, and create a category via the entry row's quick-create shortcut and confirm it's selected — asserting on `data-testid` hooks, sharing the WDIO session per `technical-architecture.md` §2.3 (same `ensureRoutedShell()` pattern as `e2e/accounts.e2e.ts`/`e2e/categories.e2e.ts`).
- `e2e/categories.e2e.ts` gets the blocked-with-count delete scenario added: create an entry referencing a category (via this ticket's own test setup), then attempt to delete that category from the Postes tab and assert deletion is blocked with the usage count shown, per the note left in `04-categories.md`'s Testing Decisions and recorded in `.scratch/categories/notes.md`.

Out of scope: any new user-facing behavior — this ticket only adds test coverage.

**Blocked by:** `entries` ticket 04 — Category quick-create from the entry row

**Status:** ready-for-agent

- [ ] `e2e/entries.e2e.ts` exists: create an entry via the inline row, edit it in place, toggle reconciled, delete it behind confirmation
- [ ] `e2e/entries.e2e.ts` covers creating a category via the entry row's quick-create shortcut and confirms it's selected
- [ ] `e2e/categories.e2e.ts` gets the blocked-with-count delete scenario (category referenced by an entry created in this ticket's setup)
- [ ] Both scenarios share the WDIO session per `technical-architecture.md` §2.3, consistent with `e2e/accounts.e2e.ts`/`e2e/categories.e2e.ts`
