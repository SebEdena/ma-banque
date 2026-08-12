# Respecting a working agent's time

An agent that has gone idle between turns, or whose diff hasn't changed on the last poll or two, is not necessarily stuck — it may be running a slow local build, a full test suite, or genuinely thinking through a hard review question (the Promise/`resource()` investigation and the `String`-vs-`IsoDate` explanation in this skill's own history each took real, unhurried analysis). `ListAgents` reporting an agent unreachable between turns is normal, not a stall signal by itself.

- Do not treat "unreachable" or "diff unchanged" on a single poll, or even two, as a stall. Give an agent generous room — several consecutive polls with a real gap between them (tens of minutes, not a handful of 3-minute cycles) — before concluding it's stuck.
- Never nudge or interrupt an agent just because one polling cycle passed with no visible change; a nudge sent mid-thought or mid-build interrupts work that was proceeding fine.
- Before nudging, prefer widening the polling interval to give more headroom rather than escalating on the same short cadence.
- Only after sustained, repeated silence (no diff change, no response, agent unreachable across many well-spaced polls) should you send a status-check nudge — and only after that goes unanswered for a similarly generous stretch should you surface a possible stall to the user, rather than unilaterally killing or respawning it.

Used by: `actions/review/02-poll-pr.md`, and any other action that polls a live sub-agent.
