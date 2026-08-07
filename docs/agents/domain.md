# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

This repo currently has no `CONTEXT.md`/`CONTEXT-MAP.md`/`docs/adr/` yet. The closest existing domain reference is `docs/spec/00-business-requirements.md` (functional domain model and vocabulary) and `docs/architecture/technical-architecture.md` §4 (the French UI ↔ English code-identifier glossary) — treat those as authoritative until `CONTEXT.md` exists.

## File structure

Single-context repo (this repo):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-....md
│   └── 0002-....md
└── src/ (Angular), src-tauri/src/ (Rust)
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md` once it exists — until then, use the business-requirements vocabulary (`Compte`/`Account`, `Poste`/`Category`, `Écriture`/`Entry`, `Règle de périodicité`/`RecurringRule`, `Pointage`/`Reconciliation` — see the glossary in `technical-architecture.md` §4). Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
