# AGENTS.md

Agent-facing configuration for this repo.

## Agent skills

### Issue tracker

Local markdown — specs live at `docs/spec/<NN>-<slug>.md`, implementation tickets at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root (neither exists yet; created lazily by `/domain-modeling`). See `docs/agents/domain.md`.
