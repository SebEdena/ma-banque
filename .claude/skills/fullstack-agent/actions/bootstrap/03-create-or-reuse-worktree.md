# 03 — Create or reuse worktree

Get the feature onto its own git worktree and branch, applying the feature-level blocking safeguard first.

## Input

- `feature` (required) — feature slug
- state from `02-resolve-state.md`

## Output

```json
{ "worktree_path": "<path>", "branch": "<name>", "reused": true }
```

## Process

1. Apply the feature-level check in [[safeguards]]: read the feature's spec header (`docs/spec/<NN>-<slug>.md`) for a "Blocked by" declaration. If blocked, do not proceed — skip this feature and report why.
2. If `02-resolve-state.md` found an existing worktree/branch for this feature, reuse it. Never create a second worktree or branch for the same feature.
3. Otherwise, create a new git worktree named for the feature and a new branch for it. Do not switch to the new branch.
4. Record the feature's worktree and branch so later actions can act on this feature without disturbing any other feature in progress.
5. Hand off to `actions/implement/01-select-next-issue.md`.

## Test

Running this action twice in a row for the same feature (second time simulating a resumed session) produces the same `worktree_path`/`branch` both times, and `git worktree list` shows exactly one entry for the feature.
