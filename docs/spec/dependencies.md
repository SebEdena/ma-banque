# Spec Dependency Graph

Build order for `docs/spec/`, derived from the data/screen dependencies in `00-business-requirements.md` §§3–4 and cross-checked against `docs/design/design.html` (see the "Cross-checked against the existing prototype" notes in `03`–`05`).

```mermaid
graph TD
    subgraph foundation["Foundation · done"]
        s00["00-business-requirements"]
        s01["01-setup-backend"]
        s02["02-setup-frontend-ci"]
    end

    subgraph layer1["Layer 1 · done"]
        s03["03-accounts"]
        s05["05-settings-remainder"]
        s04["04-categories"]
    end

    subgraph layer2["Layer 2 · done"]
        s06["06-entries"]
    end

    subgraph layer3["Layer 3 · written"]
        s07["07-recurring-entries"]
        s08["08-reconciliation"]
        s09["09-statistics"]
    end

    s01 --> s03
    s02 --> s03
    s01 --> s05
    s02 --> s05
    s01 --> s04
    s02 --> s04
    s05 -->|"blocks: owns the Settings shell 04's Postes tab plugs into"| s04

    s03 -->|account_id| s06
    s04 -->|category_id| s06

    s03 -->|template fields| s07
    s06 --> s07
    s06 --> s08
    s06 --> s09
    s04 --> s09

    classDef done fill:#dce8df,stroke:#3d6b52,stroke-width:1.5px,color:#1f2420;
    classDef written fill:#dde3f7,stroke:#4a5fa8,stroke-width:1.5px,color:#1f2420;
    classDef todo fill:#f2e3cd,stroke:#b6752b,stroke-width:1.5px,stroke-dasharray:4 3,color:#1f2420;
    class s00,s01,s02,s03,s04,s05,s06 done;
    class s07,s08,s09 written;
```

## Reading the graph

- **Foundation** (`00`–`02`) is written and implemented.
- **Layer 1** (`03`–`05`) is written and implemented. `03-accounts` and `05-settings-remainder` are mutually independent; `04-categories` is **blocked by `05-settings-remainder`** — not just informally coordinated — because `05` owns the Settings screen's shell/sub-nav (Postes / Affichage / Stockage) that `04`'s "Postes" tab plugs into. `04` and `05` are declared blocked-by in the issue tracker specifically so `fullstack-agent` never runs them as concurrent features; `03` can run concurrently with either.
- **Layer 2** (`06-entries`) was the pinch point — it needed both `03-accounts` (`account_id`) and `04-categories` (`category_id`) — and is now written and implemented.
- **Layer 3** (`07`–`09`) are the 3 remaining features — now written (`ready-for-agent`), not yet implemented. All depend on `06-entries` existing; `07-recurring-entries` additionally reuses account/entry template fields from `03`, and `09-statistics` additionally needs `04-categories` for its per-category breakdown.

## Settled since the graph was first drawn

- No reconciliation status indicator on the home screen, ever (`03-accounts.md`) — not deferred to `08-reconciliation`.
- Account deletion is UI-reachable only from the archived-accounts view, guarded on "no entries beyond the system entry," behind a named-confirmation dialog (`03-accounts.md`).
- `04-categories` ↔ `05-settings-remainder` has a fixed landing order (`05` first), not a "whichever lands first" coordination note.
- Statistics (`09-statistics.md`) is reached via a "Statistiques" button in the account header, account-scoped — not a persistent sidebar rail item as §4 of the business requirements literally describes. Same kind of prototype-driven correction `04-categories.md` made for "Postes."
