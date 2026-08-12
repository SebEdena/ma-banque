# 01 — Sweep worktrees

Catch worktrees that were never cleaned up, beyond the merged-PR case already handled in `actions/review/04-handle-merge.md`.

## Input

- none

## Output

Lines from `scripts/sweep-worktrees.sh`, one per non-primary worktree:

```
SAFE-TO-DELETE <path> <branch>
FLAG: <reason> <path> <branch>
```

## Process

1. Run `scripts/sweep-worktrees.sh` alongside `actions/bootstrap/01-sync-repo.md`.
2. Interpret each verdict:
   - **Closed without merge** (`CLOSED`, not `MERGED`): flag to the user rather than auto-deleting — the branch may hold unmerged work that was intentionally set aside, not abandoned.
   - **Orphaned**: a worktree/branch whose spec file no longer exists under `docs/spec/`. Flag, don't auto-delete.
   - **Stale**: no commits or issue-file updates in 14+ days and no open PR — likely an abandoned interrupted session. Flag it rather than silently resuming it (see [[resuming]]) or silently deleting it.
   - **Dirty**: the script checks `git status` in every non-merged candidate before flagging it, so uncommitted or unpushed work is always called out explicitly rather than folded into a generic "safe to delete" suggestion.
3. Never delete anything the sweep didn't mark `SAFE-TO-DELETE` (i.e. merged and clean) without asking the user first.

## Test

Run against a repo with one merged-and-clean worktree, one dirty worktree with an open PR, and one clean worktree with no spec file: the output marks the first `SAFE-TO-DELETE`, flags the second as `dirty` (the script checks dirtiness before PR state, so a dirty-but-open-PR worktree is reported dirty, not `open-pr`), and flags the third as `orphaned`.
