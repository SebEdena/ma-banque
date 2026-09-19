# 04 — Handle merge

Observe reality (not agent self-report) to detect when a PR is merged or closed, and stop tracking it.

## Input

- `pr` — from `02-poll-pr.md`

## Output

```json
{ "pr": 117, "state": "MERGED|CLOSED", "tracking_stopped": true }
```

## Process

1. When `02-poll-pr.md` observes a PR is no longer open (`gh pr list`/`gh pr view --json state`), stop tracking it so it drops out of future sweeps.
2. If `state` is `MERGED`: delete that feature's worktree and branch (safe — the work survives in the merge commit) and stop that feature's agents. This also removes `<worktree_path>/.scratch/<feature>/pr-poll-state.json` as a side effect, per [[poll-state]]. Continue tracking any other features still in progress.
3. If `state` is `CLOSED` without merge: do not auto-delete the worktree. Explicitly delete `<worktree_path>/.scratch/<feature>/pr-poll-state.json` per [[poll-state]] — this PR has no future sweep to serve, and leaving stale poll state around risks it being misread if the branch is ever reused. Hand off to `actions/cleanup/01-sweep-worktrees.md`, which will flag the worktree as `closed-without-merge` for the user — the branch may hold unmerged work that was intentionally set aside, not abandoned.

## Test

For a merged PR, this action results in `git worktree list` no longer showing that feature's worktree (and with it, `.scratch/<feature>/pr-poll-state.json` inside that worktree), and the feature's `ScheduleWakeup` polling stops covering it on the next sweep. For a closed-but-unmerged PR, the worktree is left in place and flagged, not deleted, but the poll-state file inside it is still removed.
