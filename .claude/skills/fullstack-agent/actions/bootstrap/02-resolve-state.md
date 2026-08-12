# 02 — Resolve state

Determine whether a named feature is a clean start or a resume of interrupted work, per [[resuming]].

## Input

- `feature` (required) — feature slug named by the user

## Output

```json
{
  "feature": "<slug>",
  "worktree_exists": true,
  "worktree_path": "<path|null>",
  "branch": "<name|null>",
  "issue_statuses": { "<issue-file>": "done|ready-for-agent|..." },
  "open_pr": "<url|null>",
  "merged_pr": true,
  "resume_from_issue": "<issue-file|null>"
}
```

## Process

1. Check `.scratch/<feature>/issues/`. If it doesn't exist, stop — ask the user to generate the issue files first; do not proceed to bootstrap.
2. If every issue file's `**Status:**` is `done`, stop — report the existing implementation to the user; do not re-bootstrap.
3. Otherwise apply `references/resuming.md` in full: check `git worktree list` / `git branch --list <feature-slug>*`, re-read every issue file's `**Status:**`/`**Blocked by:**`, inspect the worktree's `git status`/`git log` for unreconciled in-flight work, and check `gh pr list --head <feature-branch>`.
4. Emit the resolved state for `03-create-or-reuse-worktree.md` and `actions/implement/01-select-next-issue.md` to consume.

## Test

For a feature with an existing worktree and one `done` issue: this action's output reports `worktree_exists: true` with the correct `worktree_path`, and `resume_from_issue` equals the first non-`done` issue file, not the first issue file overall.
