# 03 — E2E: Postes tab category management

**What to build:** the E2E scenario `docs/spec/04-categories.md`'s Testing Decisions section calls for, which neither ticket 01 nor ticket 02 picked up when this feature was broken into tickets.

Scope, per `docs/spec/04-categories.md`:

- `e2e/categories.e2e.ts` (WebdriverIO): from Settings' "Postes" sub-section, create a category, edit it, and delete it — asserting on real `data-testid` hooks.
- Shares the WDIO session per `technical-architecture.md` §2.3 (`ensureRoutedShell()` in `e2e/support/routed-shell.ts`), same pattern as `e2e/accounts.e2e.ts`.
- **Blocked-with-count delete path is not testable yet and is explicitly deferred, not skipped silently**: it needs a category actually referenced by an entry, and no ticket has exposed an entry-creation Tauri command or UI (`06-entries.md` owns that). Do not invent a private test-only command or reach into the database directly to fake this — that's scope creep this ticket doesn't need. Instead: cover it with the confirm-delete (usage count 0) path only here, and record in `.scratch/categories/notes.md` under `## Cross-issue notes` that `06-entries.md` inherits adding the blocked-with-count scenario to `e2e/categories.e2e.ts` once it exists.

Out of scope: anything not covered by the spec's E2E bullet (no new user-facing behavior, this ticket only adds test coverage); the blocked-with-count delete scenario (deferred to `06-entries.md`, see above).

**Blocked by:** `categories` ticket 02 (Postes tab category management panel) — needs the UI and its `data-testid` hooks to exist first.

**Status:** done

- [x] `e2e/categories.e2e.ts` exists and creates a category from the Postes tab
- [x] Editing a category is covered
- [x] Deleting a category with usage count 0 (plain confirm) is covered
- [x] Scenario shares the WDIO session per `technical-architecture.md` §2.3, consistent with `e2e/accounts.e2e.ts`
- [x] `.scratch/categories/notes.md` records that `06-entries.md` inherits adding the blocked-with-count e2e scenario
