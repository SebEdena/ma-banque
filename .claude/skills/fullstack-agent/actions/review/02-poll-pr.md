# 02 — Poll PR

One sweep of the manager's own `ScheduleWakeup` polling loop, covering every currently open PR across every feature. There is no separate pr-agent actor (see [[actors]]) — the manager polls directly, since a spawned agent can't wake itself back up.

The loop's memory of "what's already been seen" must survive the manager's own session ending mid-loop — see [[poll-state]] for why and how.

## Input

- none (derives state fresh each sweep; per-PR memory comes from `.scratch/<feature>/pr-poll-state.json`, not session memory)

## Output

```json
{
  "open_prs": ["<url>", "..."],
  "new_comments_by_pr": { "<pr>": ["..."] },
  "trigger_events": [{ "pr": 117, "comment_id": "...", "authorized": true }]
}
```

## Process

1. Derive the current set of open PRs by checking `git worktree list` (or your own record of feature branches) against `gh pr list --head <branch>` per feature — don't hardcode a PR list, since features start and finish over the loop's lifetime.
2. For each open PR, load `.scratch/<feature>/pr-poll-state.json` per [[poll-state]] (treat a missing file as a first-ever sweep for that PR). Fetch comments using `scripts/poll-pr-comments.sh <pr-number>` (merges top-level + inline comment surfaces in one call, sorted by time — prefer it over calling `gh pr view`/`gh api` separately so an inline comment is never missed), and keep only entries newer than `last_seen_comment_at` from the loaded state. **Always** surface every new comment and every review-status change (including "requested changes") to the user — visibility is never gated on anything below.
3. Classify each new comment (top-level or inline) as a trigger only when both hold:
   - it contains the trigger phrase **`@agent-review`** (deliberately not `@claude`, so it never collides with the official Claude GitHub Action's default trigger phrase), **and**
   - the commenting user has write access — check with `scripts/check-write-access.sh <username>`, mirroring the write-access gate the official Claude GitHub Action applies to `@claude` mentions.
4. A comment that mentions `@agent-review` but fails the access check is flagged to the user as flagged, not auto-actioned — never silently ignored, never silently executed.
5. Ignore comments authored by your own bot identity or other known bots, to avoid retriggering yourself in a loop.
6. Cap auto-resumes (fresh feature-agent spawns triggered by a comment) to 5 per PR, read from `auto_resume_count` in the persisted state — **not** a session-local counter, so the cap holds across a restarted session too. Past that, stop reacting automatically to that PR and ask the user before continuing.
7. Apply [[respecting-agent-time]] before treating any currently-running feature agent as stalled.
8. Forward each authorized trigger to `03-spawn-review-round.md`. When a PR is merged or closed, hand off to `04-handle-merge.md` instead.
9. After processing, write the updated `last_seen_comment_at`/`last_seen_comment_id` (newest comment observed this sweep, trigger or not) and `auto_resume_count` back to `.scratch/<feature>/pr-poll-state.json` per [[poll-state]], **before** rescheduling — a crash after the write is safe (worst case, one comment gets re-surfaced to the user next sweep); a crash before it would replay already-handled comments.
10. Reschedule the next wakeup as long as any PR remains open across any feature, following the numeric cadence in [[respecting-agent-time]]. Once none are open, stop scheduling — a new PR opening (`01-open-pr.md` finishing) is what starts the loop again.

## Test

Post an inline (not top-level) review comment containing `@agent-review` from a write-access account: this action's `trigger_events` output includes it with `authorized: true` — confirming `scripts/poll-pr-comments.sh` catches inline comments, not just top-level ones.

Kill the manager session immediately after a sweep that updated `pr-poll-state.json` but before the next wakeup, then start a fresh session and resume the feature (`actions/bootstrap/02-resolve-state.md`): the next sweep's `new_comments_by_pr` does not include comments already reflected in `last_seen_comment_at`, and a trigger that would push `auto_resume_count` past 5 is still correctly refused, not reset to 0.
