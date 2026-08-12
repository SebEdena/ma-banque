# 01 — Select next issue

Pick the next issue to implement for a feature, applying the issue-level checks in [[safeguards]].

## Input

- `feature`, `worktree_path`, `branch` — from `actions/bootstrap/03-create-or-reuse-worktree.md`

## Output

```json
{ "issue_file": "<path|null>", "reason_if_null": "all-done|all-blocked-or-not-startable" }
```

## Process

1. List issue files under `.scratch/<feature>/issues/` whose `**Status:**` is not `done`, in file order.
2. For each, apply the issue-level safeguards: status must be `ready-for-agent` (or an in-progress status set by a prior run) and every ticket in `**Blocked by:**` — in this feature or another — must be `done`. Skip any issue that fails either check; re-check skipped issues after the next issue completes rather than starting out of order.
3. Return the first issue that passes both checks.
4. If none pass: if all are `done`, hand off to `actions/review/01-open-pr.md`. If none are `done` but all remaining are blocked/not-startable, stop and report to the user instead of looping or forcing a start.

## Test

Given three issues where #1 is `done`, #2 has `**Blocked by:** #3` and #3 is `ready-for-agent`, this action selects #3, not #2 — blocked issues are skipped even when they appear earlier in file order.
