# 01 — Sync repo

Make sure the local repository is up to date with the remote before reasoning about any feature's state.

## Input

- none

## Output

```json
{ "synced": true }
```

## Process

1. Run `git fetch origin` (and `git pull` on the primary branch if it's checked out) so `git worktree list`, `git branch --list`, and `gh pr list` reflect current remote state.
2. Proceed to `02-resolve-state.md` for each feature the user named.

## Test

After running this action, `git status` on the primary worktree shows no "behind origin" message, and `git log origin/<default>` is reachable without a fetch.
