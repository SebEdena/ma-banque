# 03 — Data-folder-location setting: end-to-end proof command

**What to build:** A developer (and, later, the Settings screen) can get and set the SQLite data **folder**'s location through real Tauri commands, exercising the full stack — `commands → usecases → infra → SQLite → back` — proving the Clean Architecture wiring from tickets 01/02 actually works before any business feature is built on top of it. This doubles as the first real backend piece of the future Settings screen (business requirements §4.6).

Scope, per `docs/spec/01-setup-backend.md` and business requirements §2.3.1:

- The location pointer is a **folder path**, tracked in a small config file kept **outside** the SQLite database itself (e.g. JSON in the OS-standard app config directory) — read before any database connection is opened. Default: an app-managed `saves/` subfolder under the OS-standard app data directory.
- A repository trait defined in `domain/` (e.g. `DataFolderLocationRepository`) for reading/writing the pointer, with a concrete implementation in `infra/` operating on the pointer config file (not the SQLite connection — this setting must be readable before the database is even opened).
- Use cases / commands:
  - **Get current folder** (or "no pointer set" for first launch / unreachable folder).
  - **Set folder to default** — creates the `saves/` folder if missing, points there.
  - **Set folder to a user-chosen path ("Open a different folder")** — validates: empty/non-matching folder is accepted as fresh (a new database will be created + migrated there by ticket 02's migration runner on next connection); a folder containing a `ma-banque.sqlite` that fails schema validation is rejected with a distinct error.
  - **Move folder to a new path ("Move data folder")** — copies current folder contents to the destination, verifies the copy (re-open + validate), deletes old contents only after verification succeeds; rejected up front if the destination already contains a valid `ma-banque.sqlite` (no silent overwrite/merge).
- `thiserror`-based domain/use-case error enum(s), `#[derive(Serialize)]`, so Angular can branch on specific error variants (e.g. `NoPointerSet`, `FolderUnreachable`, `InvalidExistingSave`, `DestinationOccupied`).
- `anyhow` used for infra-layer failures (I/O, filesystem, SQLite errors), converted to a single generic serializable error at the Tauri command boundary — no internal details leaked to the UI.
- Still no business entities (`Account`, `Category`, `Entry`, `RecurringRule`, `Reconciliation`).

Out of scope: the migration backup/downgrade-guard logic itself (amendment to ticket 02 — this ticket only owns the folder pointer and move/open operations, not what happens once the migration runner opens whatever folder this points at).

**Blocked by:** ~~02 — Shared SQLite connection & migration runner~~ (done); depends on the backup/downgrade-guard amendment noted there being resolved first if "Open a different folder" needs to surface those same errors consistently.

**Status:** done

- [x] Domain repository trait for the data-folder pointer is defined in `domain/`, implemented in `infra/` against an external config file (not the SQLite connection)
- [x] Default folder (`saves/` under the OS app data directory) can be created and pointed to
- [x] "Get current folder" returns a distinct "no pointer set" result when none exists (first launch / unreachable folder case)
- [x] "Open a different folder" accepts an empty/non-matching folder as fresh, and rejects a folder with an invalid `ma-banque.sqlite` with a distinct error
- [x] "Move data folder" copies, verifies, then deletes old contents only after verification; rejects up front if the destination already holds a valid save
- [x] Domain/use-case errors are `thiserror` enums, `#[derive(Serialize)]`, with distinct variants per case above
- [x] Infra errors are converted to a single generic serializable error (the same `DataFolderLocationError`) right at the repository boundary — since the domain trait's signature already commits to that type, there's no separate `anyhow` hop before the Tauri command; the effect (no raw I/O internals reach Angular) is the same
- [x] Tauri commands expose get/set-default/open-folder/move-folder and call the use cases
- [x] Use-case unit tests run against a hand-written in-memory fake of the repository trait (no `mockall`)
- [x] Integration tests cover: no pointer, unreachable folder, move into occupied destination (rejected), open onto empty folder (accepted), open onto invalid save (rejected)
- [x] The command path is proven end-to-end via a test exercising the use-case call path
- [x] `cargo fmt --check`, `cargo clippy -- -D warnings`, and `cargo test` all pass locally
- [x] No business entities or rules are introduced

**Implementation notes:**
- `FsDataFolderLocationRepository` (`infra/data_folder_location.rs`) holds `config_dir`/`data_dir`, managed as `tauri::State` in `lib.rs`'s `.setup()` hook alongside the existing `SharedConnection`.
- Pointer file: `{app_config_dir}/config.json`. Default folder: `{app_data_dir}/saves/`. Validity check (`is_valid_save`): opens the candidate `ma-banque.sqlite` read-only, checks for the `settings` table, and (after a code-review fix) also checks the schema isn't newer than supported via `infra::db::is_schema_supported` — reusing ticket 04's downgrade guard so "Open a different folder" and the actual connection step agree on what's valid.
- `move_folder`'s post-copy verification failure maps to `DataFolderLocationError::Io` (not `FolderUnreachable`, which is reserved for "no pointer resolves to a reachable folder") and best-effort deletes the partial copy at the destination before returning, leaving the untouched current folder as the source of truth. The now-unused `FolderUnreachable` variant was removed from the domain error enum.
