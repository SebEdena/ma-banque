# Issue tracker: Local Markdown

Issues and specs (you may know a spec as a PRD) for this repo live as markdown files, in two tiers already established in this repo:

- **Specs** (PRDs) live at `docs/spec/<NN>-<slug>.md`, numbered from `00`, one file per feature area. See `docs/spec/00-business-requirements.md` onward for the existing convention and template shape (Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Further Notes).
- **Implementation tickets** for a given spec live under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file. `<feature-slug>` matches the spec it was broken down from (e.g. `docs/spec/01-setup-backend.md` → `.scratch/setup-backend/issues/`).

## Conventions

- Triage state and progress are recorded as a bold **`Status:`** line near the top of each ticket file (see `triage-labels.md` for the role strings; implementation-in-progress/complete states like `done` are also used once a ticket moves past triage — see existing tickets under `.scratch/*/issues/` for examples).
- Blocking is recorded as a bold **`Blocked by:`** line near the top of the ticket file (e.g. `**Blocked by:** None — can start immediately`, or `**Blocked by:** 02-sqlite-connection-and-migrations`).
- Comments and conversation history append to the bottom of the file under a `## Comments` heading.

## When a skill says "publish to the issue tracker"

- If the output is spec-shaped (a PRD produced by `/to-spec`), create the next-numbered file under `docs/spec/`.
- If the output is ticket-shaped (a piece of implementation work produced by `/to-tickets`), create a new file under `.scratch/<feature-slug>/issues/` (creating the directory if needed), following the numbering and `Status:`/`Blocked by:` conventions above.
- **Every bullet in the spec's `Testing Decisions` section must land as an acceptance-criteria line on exactly one ticket** — most naturally the ticket that builds the flow it tests, but a dedicated ticket is fine too. This applies in particular to E2E scenarios: `03-accounts.md` and `04-categories.md` both stated an E2E requirement in `Testing Decisions` that no ticket's acceptance criteria ever picked up, so both features shipped without it and it had to be patched in after the fact. Breaking a spec into tickets isn't done until every `Testing Decisions` bullet has a ticket owner — treat an unassigned one as a bug in the breakdown, not something to note and move on from.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path, the feature slug, or the ticket number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved` (or the triage roles, per the conventions above, for tickets not driven by `/wayfinder`).
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
