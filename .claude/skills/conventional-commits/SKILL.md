---
name: conventional-commits
description: Compose commit messages in Conventional Commits format (type(scope): description). Use when the user asks to commit changes, create a commit, or mentions conventional commits, semantic commits, or commit message format/convention.
---

Conventional Commits gives every commit a machine-parseable header: `type(scope)!: description`, followed by an optional body and footer.

## Steps

1. Inspect the staged diff (`git diff --cached`) and classify the change against the type table below, based on what the diff actually does — not the branch name or the user's phrasing. If the diff mixes unrelated types (e.g. a feature plus an unrelated refactor), tell the user and suggest splitting into separate commits rather than picking one type that half-fits.
2. Pick a scope: the module, package, or directory most affected (e.g. `auth`, `docs`), lowercase, no spaces, no `docs/` slashes. Omit scope entirely when the change spans the whole repo or no single area fits — don't force one. For changes confined to AI-tooling config (`.claude/skills/`, `.claude/agents/`, `AGENTS.md`, `CLAUDE.md`, or similar agent-facing files with no effect on the shipped app), use `chore(agent): ...` — `cliff.toml` skips this scope from the changelog entirely, same as `chore(release):`, so it doesn't clutter the "Miscellaneous Tasks" section with commits no changelog reader cares about.
3. Write the header: `type(scope): description` in imperative mood ("add", not "added"/"adds"), lowercase after the colon, no trailing period, ideally ≤72 characters. If the change breaks a public API, schema, or contract, append `!` right after the type/scope: `feat(api)!: ...`.
4. If the "why" isn't obvious from the diff alone, add a body: blank line, then prose explaining motivation and effect, not a restatement of the diff.
5. If breaking, add a footer: blank line, then `BREAKING CHANGE: <what changed and how callers must adapt>`.
6. If the user names an issue/ticket, add a footer line (`Refs #123` or `Closes #123`).
7. Hand the composed message to this repo's standard git commit process (staging review, heredoc, trailers) — this skill governs message content only, not commit mechanics or when to commit.

## Type table

| Type       | Use for                                                 |
| ---------- | ------------------------------------------------------- |
| `feat`     | a new user-facing capability                            |
| `fix`      | a bug fix                                               |
| `docs`     | documentation only                                      |
| `style`    | formatting/whitespace with no code meaning change       |
| `refactor` | code change that neither fixes a bug nor adds a feature |
| `perf`     | a performance improvement                               |
| `test`     | adding or correcting tests                              |
| `build`    | build system or dependency changes                      |
| `ci`       | CI configuration                                        |
| `chore`    | maintenance work outside src/test (tooling, config)     |
| `revert`   | reverts a previous commit                               |
