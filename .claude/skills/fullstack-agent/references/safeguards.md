# Safeguards

Before starting any unit of work — a feature or an issue — check whether it's actually startable. Never start something blocked or not yet triaged for agent work; skip it and move on, or stop and report if nothing is left to do.

- **Feature-level blocking**: before creating a feature's worktree or spawning its feature agent, read that feature's spec header (`docs/spec/<NN>-<slug>.md`) for a "Blocked by" declaration. If the feature is blocked by another feature, do not create its worktree or spawn its agent until every issue in the blocking feature's `.scratch/<feature>/issues/` is `done` **and** that feature's pull request is merged — a blocking feature isn't finished just because its issues say `done` if the PR itself is still open.
- **Issue-level status**: an issue is startable only if its `**Status:**` is `ready-for-agent` (or an in-progress status already set by a prior run of this workflow) — see `docs/agents/triage-labels.md`. Never run `/implement` on an issue whose status is `needs-triage`, `needs-info`, `ready-for-human`, `wontfix`, or anything else outside the startable set; skip it.
- **Issue-level blocking**: an issue is startable only if every ticket named in its `**Blocked by:**` line (see `docs/agents/issue-tracker.md`) — whether in this feature's own issue list or another feature's — is `done`. If any blocker isn't `done` yet, skip that issue and re-check it after the next issue completes, rather than starting it out of order.
- If every remaining issue for a feature is either blocked or not in a startable status, the manager stops spawning issue agents for that feature and reports this to the user instead of looping or forcing a start.

Used by: `actions/bootstrap/03-create-or-reuse-worktree.md` (feature-level check), `actions/implement/01-select-next-issue.md` (issue-level checks).
