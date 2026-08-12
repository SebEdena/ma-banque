# 01 — Open PR

Once every issue for a feature is `done` (or blocked/not-startable, per [[safeguards]]), spawn a feature agent to open the pull request.

## Input

- `feature`, `worktree_path`, `branch`

## Output

```json
{ "pr_url": "<url>", "pr_number": 117 }
```

## Process

1. Spawn a feature agent (see [[actors]]) for this feature, seeded with a pointer to `.scratch/<feature>/notes.md` and the branch state — not a carried-over implementation history, since it wasn't the agent that did any of the issue work.
2. The agent creates a pull request for the feature branch and reports the PR link and a summary of the implementation to the manager.
3. This feature agent's job is now finished — discard it, don't keep it idle. It is never resumed; each future round of PR feedback gets its own fresh spawn (`03-spawn-review-round.md`).
4. Report the feature's implementation summary and PR link to the user.
5. Hand off to `02-poll-pr.md` to start (or confirm) the polling loop.

## Test

After this action, no feature-agent session remains addressable for this feature — the next round of feedback must spawn a fresh one, verified by checking `ListAgents` shows no lingering session tied to this PR.
