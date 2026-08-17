# Respecting a working agent's time

An agent that has gone idle between turns, or whose diff hasn't changed on the last poll or two, is not necessarily stuck — it may be running a slow local build, a full test suite, or genuinely thinking through a hard review question (the Promise/`resource()` investigation and the `String`-vs-`IsoDate` explanation in this skill's own history each took real, unhurried analysis). `ListAgents` reporting an agent unreachable between turns is normal, not a stall signal by itself.

- Do not treat "unreachable" or "diff unchanged" on a single poll, or even two, as a stall. Give an agent generous room — several consecutive polls with a real gap between them (tens of minutes, not a handful of 3-minute cycles) — before concluding it's stuck.
- Never nudge or interrupt an agent just because one polling cycle passed with no visible change; a nudge sent mid-thought or mid-build interrupts work that was proceeding fine.
- Before nudging, prefer widening the polling interval to give more headroom rather than escalating on the same short cadence.
- Only after sustained, repeated silence (no diff change, no response, agent unreachable across many well-spaced polls) should you send a status-check nudge — and only after that goes unanswered for a similarly generous stretch should you surface a possible stall to the user, rather than unilaterally killing or respawning it.

## Poll cadence for `02-poll-pr.md`

Use this schedule instead of inventing an interval each sweep:

- **First wakeup after a PR opens, or right after any new comment was seen:** 120s.
- **Each subsequent wakeup with no new comment since the last sweep:** double the previous interval, capped at 3600s (the `ScheduleWakeup` ceiling) — 120 → 240 → 480 → 960 → 1920 → 3600 → 3600 ...
- **Reset to 120s** the moment a sweep observes any new comment or review-status change on that PR — any activity resets the backoff, since it signals a human is actively engaged.
- Never schedule below 60s (the `ScheduleWakeup` floor) or above 3600s (its ceiling).
- When multiple PRs are open across features, wake on the **soonest** interval among them, not the average — a fast-moving PR isn't slowed down by a quiet one, and don't spawn one `ScheduleWakeup` per PR.

Used by: `actions/review/02-poll-pr.md`, and any other action that polls a live sub-agent.
