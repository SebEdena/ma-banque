# AGENTS.md

Agent-facing configuration for this repo.

## Agent skills

### Issue tracker

Local markdown — specs live at `docs/spec/<NN>-<slug>.md`, implementation tickets at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root (neither exists yet; created lazily by `/domain-modeling`). See `docs/agents/domain.md`.

## Visual verification of UI changes

Don't reach for a full `npm run tauri dev`/`npm run tauri build` just to eyeball a screen — it's slow, especially after a clean `target/`. Run `npm run start:mock` instead: plain Angular in a browser tab, backed by in-memory fakes instead of Tauri, ready in seconds. See the README's "Run just the Angular frontend, without Tauri" section for what it does and doesn't cover. Cross-check the rendered markup against `docs/design/design.html`'s inline styles for the screen in question, not just the issue file's checklist — issue files describe behavior, not pixel-level styling.
