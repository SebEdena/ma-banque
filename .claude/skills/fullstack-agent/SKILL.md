---
name: fullstack-agent
description: Fullstack agent harness that coordinates worktree setup, feature-agent implementation, and PR monitoring to build one or more features end-to-end from specs to merge, running a feature agent per feature concurrently when several are requested.
disable-model-invocation: true
---

# Summary

You are the manager of a team of agents, coordinating the work needed to build one or more fullstack features end-to-end, from a spec in `docs/spec/` to a merged PR. See [[actors]] for the roles involved.

When the user names more than one feature, run them concurrently: bootstrap each feature independently (own worktree, own branch) and track them in parallel rather than finishing one before starting the next.

For a named feature, check `.scratch/<feature>/issues/`:

- No issue files yet → stop, ask the user to generate them.
- Every issue file's `**Status:**` is `done` → stop, summarize the existing implementation.
- Otherwise → run the phases below, starting with Bootstrap (which includes the resume check).

## Iron rule

The manager follows one phase's actions in order; it does not inline a phase's logic into this file, and it does not jump back to an earlier phase's actions once a later phase has started for a given feature. Each action's own `## Process` is the source of truth for that step.

## Phases

### Bootstrap (3 actions)

Gets a feature onto its own worktree/branch — reusing one from an interrupted prior run if it finds one, per [[resuming]].

| #   | Action                     | Role                                                                    |
| --- | -------------------------- | ----------------------------------------------------------------------- |
| 01  | `sync-repo`                | Bring the local repo up to date with remote                             |
| 02  | `resolve-state`            | Resume check: worktree/branch, issue progress, in-flight work, open PR  |
| 03  | `create-or-reuse-worktree` | Apply feature-level [[safeguards]]; create or reuse the worktree/branch |

Files: `actions/bootstrap/01-sync-repo.md` … `03-create-or-reuse-worktree.md`. Default flow: `01 → 02 → 03`.

### Implement (3 actions)

Grinds through a feature's issues one at a time, each on a fresh, short-lived issue agent.

| #   | Action              | Role                                                                                   |
| --- | ------------------- | -------------------------------------------------------------------------------------- |
| 01  | `select-next-issue` | Pick the next `done`-eligible issue, applying issue-level [[safeguards]]               |
| 02  | `spawn-issue-agent` | Spawn a fresh issue agent to run `/implement` on it                                    |
| 03  | `verify-on-disk`    | Confirm `Status: done` + commit pushed before advancing — never trust the report alone |

Files: `actions/implement/01-select-next-issue.md` … `03-verify-on-disk.md`. Default flow per issue: `01 → 02 → 03 → 01 (next issue)`, looping until every issue is `done` or none are startable — then hand off to Review.

### Review (4 actions)

Opens the PR, then owns a single `ScheduleWakeup` polling loop across every open PR, reacting to authorized reviewer feedback.

| #   | Action               | Role                                                                                                     |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------- |
| 01  | `open-pr`            | Spawn a feature agent to create the PR                                                                   |
| 02  | `poll-pr`            | One polling sweep: fetch comments, classify triggers, apply [[respecting-agent-time]] and [[poll-state]] |
| 03  | `spawn-review-round` | Fresh feature agent to address one authorized `@agent-review` round                                      |
| 04  | `handle-merge`       | Observe merge/close state; stop tracking, hand off to Cleanup on merge                                   |

Files: `actions/review/01-open-pr.md` … `04-handle-merge.md`. Default flow: `01 → 02 → (03 → 02 loop while open)`, `04` firing whenever a sweep observes the PR is no longer open.

### Cleanup (1 action)

Sweeps for worktrees the merge-path in `review/04-handle-merge.md` didn't catch.

| #   | Action            | Role                                                          |
| --- | ----------------- | ------------------------------------------------------------- |
| 01  | `sweep-worktrees` | Wraps `scripts/sweep-worktrees.sh`; flags, never auto-deletes |

Files: `actions/cleanup/01-sweep-worktrees.md`. Runs alongside `bootstrap/01-sync-repo.md` on each session start.

## References

- `references/safeguards.md` — feature-level and issue-level blocking rules
- `references/resuming.md` — resume-interrupted-work reconstruction steps
- `references/actors.md` — manager / issue-agent / feature-agent roles, terse-comms rule
- `references/respecting-agent-time.md` — stall-avoidance guidance for the poll loop
- `references/poll-state.md` — `.scratch/<feature>/pr-poll-state.json`: what the poll loop persists to survive a session restart
- `references/pr-template.md` — the PR body heading skeleton (Summary / Decisions / Test plan) used by `open-pr`

## Scripts

`scripts/` (used by the Review and Cleanup actions):

- `poll-pr-comments.sh <pr>` — merges top-level + inline PR comments into one chronological feed
- `check-write-access.sh <user>` — gates `@agent-review` triggers to users with write access
- `sweep-worktrees.sh` — reports per-worktree cleanup verdicts, never deletes

## Rules

- Exactly one phase's actions run at a time per feature. The manager decides which phase a feature is in; the actions execute it.
- Each action enforces its own preconditions and hands off explicitly to the next (see each file's `## Process`). The router (this file) never enforces those checks itself.
- If a phase can't proceed (nothing startable, feature blocked), surface that to the user instead of forcing progress or silently retrying.
- Multiple features in flight run their phases independently and concurrently — one feature reaching Review doesn't block another still in Implement.
