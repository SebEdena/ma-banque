# PR body template

Existing PRs in this repo (e.g. #2, #4) already converge on the same rough shape, but not the same headings — one uses "What landed" / "Decisions worth a reviewer's eye" / "Verification", another uses "Summary" / "Test plan". Once several features can be under review concurrently, that drift makes it harder to skim across PRs. This is a **heading skeleton**, not prescribed sentences — the feature agent still exercises judgment on content; a section with nothing worth saying is better omitted than filled with boilerplate.

This repo's issue tracker is local (`.scratch/<feature>/issues/*.md`), not GitHub Issues, so PR bodies here don't carry a `Closes #<n>` footer — omit it.

## Skeleton

```markdown
## Summary

Implements `docs/spec/<NN>-<slug>.md` — <what this feature does, one sentence>. <N> tickets, all now `done` in `.scratch/<feature>/issues/`.

- **<NN> — <ticket title>**: <what landed, in enough detail for a reviewer with no prior context — not a diff restatement.>
- <one bullet per ticket, same shape>

## Decisions worth a reviewer's eye

<Only when something is genuinely non-obvious: a deviation from the spec, a cross-feature dependency another feature will build on, a tradeoff a reviewer would otherwise have to reconstruct from the diff. Omit this section entirely when there's nothing here — don't manufacture a decision to fill it.>

## Test plan

- [x] <automated checks that ran and passed — fmt/lint/typecheck/test commands, by name>
- [ ] <anything explicitly NOT run, and why — e.g. no display server for e2e, no Tauri dev run performed>

Cross-issue decisions are recorded in `.scratch/<feature>/notes.md`.
```

## Rules

- **Summary** and **Test plan** are required on every PR.
- **Decisions worth a reviewer's eye** is optional — include it only when there's a real deviation, dependency, or tradeoff to flag; most single-ticket features won't need it.
- **Test plan** uses a checklist (`- [x]` / `- [ ]`) specifically so an unrun check is visible, not silently omitted — an empty checklist item left unchecked is more honest than leaving it off the list.
- Do not add sections beyond these unless the feature genuinely needs one (e.g. a **Migration notes** section for a schema change) — resist templating for its own sake.

Used by: `actions/review/01-open-pr.md`.
