# 03 — Verify on disk

Observe reality, not the issue agent's self-report, before advancing to the next issue.

## Input

- `issue_file`, `branch` — from `02-spawn-issue-agent.md`

## Output

```json
{ "status_is_done": true, "commit_on_remote": true }
```

## Process

1. Read `issue_file` directly and confirm its `**Status:**` line reads `done` — don't trust the agent's completion report alone.
2. Run `git log origin/<branch>` (or `git fetch` first if needed) and confirm the expected commit is present on the remote branch.
3. Only if both checks pass, loop back to `actions/implement/01-select-next-issue.md` for the next issue. If either check fails, treat the issue as still in-flight — investigate before proceeding (same posture as the in-flight-work check in [[resuming]]).

## Test

Simulate an issue agent that reports success but never pushed: this action detects `commit_on_remote: false` and blocks advancing to the next issue, rather than trusting the agent's report.
