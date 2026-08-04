# Ma Banque

Une application de gestion bancaire simple.

## Development

### Backend (`src-tauri/`)

Single Rust crate, no workspace, organized in Clean Architecture layers. See
`docs/architecture/technical-architecture.md` §1 for the full rationale;
the allowed dependency directions (enforced by convention/review, not by
crate boundaries) are documented at the top of `src-tauri/src/lib.rs`:

- `domain/` — business entities, invariants, repository traits. Depends on nothing else in this crate.
- `usecases/` — orchestration of business rules. Depends on `domain` only.
- `infra/` — concrete implementations (SQLite, ...). Depends on `domain` only.
- `commands/` — Tauri entry points. Depends on `usecases` (and `infra`'s concrete types, to wire up state).

### Versioning

`src-tauri/tauri.conf.json`'s `version` field is the single source of truth
for the app version. Bump it manually before tagging a release
(`vX.Y.Z`); the tag-triggered release workflow (see
`docs/spec/02-setup-frontend-ci.md`) builds from that value.
