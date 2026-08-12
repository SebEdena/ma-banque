# PR poll state

The `ScheduleWakeup` polling loop in `actions/review/02-poll-pr.md` only runs while the manager's session is alive. If the session ends or crashes between wakeups (and a later session resumes the feature per [[resuming]]), the loop must not rely on in-memory state from the dead session — there is none. Two things specifically must survive a session boundary:

1. **What's already been seen**, so a resumed loop doesn't re-surface (or worse, re-trigger a feature agent on) a comment it already handled a round ago.
2. **The auto-resume count**, so the 5-per-PR cap in `02-poll-pr.md` can't be reset to 0 just by the session dying and a new one picking the PR back up — otherwise the cap is trivially bypassed by attrition.

## File

One file per feature, next to its issue tracker: `.scratch/<feature>/pr-poll-state.json`.

```json
{
  "pr": 117,
  "last_seen_comment_at": "2026-08-12T10:00:00Z",
  "last_seen_comment_id": "IC_kwDOabc123",
  "auto_resume_count": 2
}
```

- `pr` — the PR number this state belongs to. If a feature's PR changes (rare — e.g. reopened under a new number), treat the file as stale and reset it rather than merging.
- `last_seen_comment_at` / `last_seen_comment_id` — the newest comment (top-level or inline, trigger or not) observed as of the last completed sweep. Used to filter `scripts/poll-pr-comments.sh` output down to genuinely new comments on the next sweep.
- `auto_resume_count` — fresh feature-agent spawns triggered by an authorized `@agent-review` comment on this PR, cumulative across every session that has ever polled it.

## Rules

- Read this file at the start of every sweep; treat a missing file as an untouched PR (first-ever sweep), not an error.
- Write the updated file **after** processing a sweep's comments but **before** scheduling the next wakeup — ordering the write before the reschedule means a crash always leaves the state at-or-behind reality, never ahead of it, so the failure mode is "a comment gets re-surfaced" (harmless, just re-shown to the user) rather than "a comment gets silently skipped."
- Delete the file when the PR is merged or closed (`actions/review/04-handle-merge.md`) — a closed PR's state has no future sweep to serve, and leaving it around risks a stale `pr` field being read if the branch is ever reused.
- This file is manager-internal bookkeeping, not part of `.scratch/<feature>/notes.md` (which is cross-issue implementation notes for agents, a different audience).

Used by: `actions/review/02-poll-pr.md`, `actions/review/04-handle-merge.md`, `references/resuming.md`.
