# 04 — Migration backups & downgrade guard

**What to build:** Before the migration runner (ticket 02) applies any pending migration on startup, it backs up the database it's about to change; and if the opened database's schema is newer than the app's known migrations, the app refuses to open it instead of attempting anything. This turns the automatic forward-migration mechanism from ticket 02 into something safe to run unattended against a real user's data, per business requirements §2.3.1.

Scope, per `docs/spec/01-setup-backend.md` and business requirements §2.3.1:

- Startup connection path now comes from ticket 03's folder pointer (`saves/<folder>/ma-banque.sqlite`), replacing the hardcoded `{app_data_dir}/ma-banque.sqlite` path from ticket 02's original implementation.
- Before running any pending migration, write a timestamped backup of the database file into the same folder (e.g. `ma-banque.sqlite.bak-<timestamp>`).
- Keep only the last 3 backups; drop the oldest first (FIFO by timestamp, not by schema version — a single startup can span multiple pending versions).
- If the opened database's schema version is newer than the highest migration the app knows about, refuse to open it: no migration attempt, no automatic fallback prompt, just a distinct, serializable error surfaced to the frontend.

Out of scope: the folder pointer / move / open-a-different-folder operations themselves (ticket 03 owns those); any business schema.

**Blocked by:** ~~02 — Shared SQLite connection & migration runner~~ (done); 03 — Data-folder-location setting: end-to-end proof command (needs the folder pointer to know which path to open/migrate)

**Status:** done

- [x] Startup connection opens the database at the folder returned by ticket 03's pointer, not a hardcoded path
- [x] A timestamped backup is written before any pending migration runs
- [x] Only the last 3 backups are kept, oldest dropped first
- [x] Opening a database with a schema newer than the app's known migrations is refused with a distinct, serializable error — no migration attempted
- [x] Integration tests cover: backup created before migration, 4th backup triggers rotation (oldest deleted), newer-than-supported schema is rejected without modification
- [x] `cargo fmt --check`, `cargo clippy -- -D warnings`, and `cargo test` all pass locally
- [x] No business entities or rules are introduced

**Implementation notes:**
- `infra::db::open_and_migrate(db_path)` replaces the old `init(Connection)` helper; `lib.rs`'s `.setup()` hook now calls `folder_repo.get_current_folder()` first and only opens/migrates if a folder is configured — matching the "don't decide unilaterally" rule from `01-setup-backend.md`. No folder configured yet → no connection is managed at startup (no command currently needs one before the frontend's future onboarding flow sets a folder).
- Downgrade guard uses `rusqlite_migration::SchemaVersion::Outside`, checked via `Migrations::current_version` before `to_latest` is ever called.
- Backup filenames are `<db-file-name>.bak-<nanos-since-epoch>`; rotation keeps the 3 most recent by sorting the matching filenames (fixed-width nanosecond timestamps sort correctly as strings).
- A startup open failure (e.g. `SchemaNewerThanSupported`) is logged via `log::error!`, stored in a managed `StartupDbError` state, and surfaced to the frontend via the `get_startup_db_error` command (`commands/db.rs`) — added after code review flagged the original "serializable but unreachable by the UI" gap.
- `infra::db::is_schema_supported(&Connection)` is shared between the downgrade guard here and `infra::data_folder_location`'s save validation (`is_valid_save`), so "Open a different folder" rejects a too-new save up front instead of accepting it and failing later at connection time — another code-review fix (the two checks previously disagreed on what counts as a valid save).
