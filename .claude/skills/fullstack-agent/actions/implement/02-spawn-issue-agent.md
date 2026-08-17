# 02 — Spawn issue agent

Spawn a fresh issue agent (see [[actors]]) to implement exactly one issue.

## Input

- `issue_file`, `feature`, `worktree_path`, `branch` — from `01-select-next-issue.md`

## Output

```json
{ "issue_file": "<path>", "reported_done": true }
```

## Process

1. Spawn a fresh issue agent on the feature's worktree/branch. Seed its prompt with: the spec, the single issue file, and either the full path to `.scratch/<feature>/notes.md` (small files) or, once it's grown past a page or two, the specific `## Cross-issue notes` bullets that plausibly bear on this issue — read the file yourself first and excerpt, don't paste the whole thing into every spawn prompt. Point at shared conventions (testing setup, naming rules, etc.) by reference to `docs/architecture/technical-architecture.md` rather than restating them inline — the agent can read that file itself.
2. The agent:
   - Runs `/implement` on the issue (runs `/tdd`, `/code-review`, and commits with Conventional Commits format).
   - Formats and lints the code per the project's standards.
   - Updates the issue file's `**Status:**` to `done` once `/implement` completes, and pushes the commit to the remote repository.
   - Writes any decision other issues will depend on (shared components, naming conventions, schema choices not obvious from the diff) as a bullet under `## Cross-issue notes` in `.scratch/<feature>/notes.md` (create the file if it doesn't exist yet).
   - Reports completion to the manager, tersely per [[actors]].
3. This issue agent's job is now finished — never keep it around or reuse it for the next issue.
4. Hand off to `03-verify-on-disk.md` before selecting the next issue.

## Test

After this action completes for an issue, the issue agent process/session is no longer addressable (it was discarded, not left idle) — `ListAgents` should not show it as reusable for a subsequent issue.
