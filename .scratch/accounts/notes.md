# Accounts — feature agent notes

## Cross-issue notes

### From 01 — Accounts backend

- **Entity ids are `INTEGER PRIMARY KEY` (SQLite rowid), surfaced as Rust `i64` / TS `number`.** No UUIDs, no
  new crate. Any later table (categories, recurring rules) should follow the same convention so foreign keys line up.
- **`accounts` table** (`migrations/0003_create_accounts.sql`): `id`, `name`, `color`, `icon`, `created_date`,
  `opening_balance`, `archived`, `last_viewed_date`. `opening_balance` is cents (`INTEGER`).
- **`entries` table** (`migrations/0004_create_entries.sql`) — the shape every later entry spec builds on:
  `id INTEGER PRIMARY KEY`, `account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE`,
  `date TEXT NOT NULL` (ISO `YYYY-MM-DD`), `type TEXT NOT NULL CHECK (type IN ('DEBIT','CREDIT'))`,
  `amount INTEGER NOT NULL CHECK (amount >= 0)` (cents, always positive — `type` carries the sign),
  `is_system INTEGER NOT NULL DEFAULT 0`, `category_id INTEGER`, `reconciled INTEGER NOT NULL DEFAULT 0`,
  `recurring_rule_id INTEGER`. Plus `entries_account_date` index and a partial unique index
  `entries_one_system_per_account ON entries (account_id) WHERE is_system = 1`.
- **`category_id` has NO `REFERENCES categories (id)` clause, deliberately.** This build of rusqlite ships SQLite
  with foreign keys enforced by default, so a forward reference to a table that doesn't exist yet fails *every*
  insert into `entries` (verified: "no such table: main.categories"). **The categories feature should create its
  `categories` table with an `INTEGER PRIMARY KEY id`; whichever spec first writes a non-null `category_id` owns
  adding the constraint** (which in SQLite means a table rebuild). `recurring_rule_id` is reserved on the same terms.
- **Money convention (first spec to introduce it):** stored and computed as `i64` cents. `domain::money::to_cents`
  / `to_major` are the only conversion sites. Commands divide once at the boundary; use cases own `f64 -> cents`
  rounding and reject anything finer than a cent. Angular never multiplies, divides, or rounds an amount.
- **Dates are `domain::date::IsoDate`** — a validated `YYYY-MM-DD` newtype whose `Ord` *is* chronological order
  (fixed-width ISO sorts lexicographically). Any later spec comparing dates should use it rather than raw strings.
- **`AccountError` messages stay in English**, serialized as `{ kind, message }` like `SettingsError`. Angular maps
  each `kind` to French — follow `parseSettingsError` in `core/settings-api` when adding `parseAccountError`.
- **`EntryRepository` (in `domain::entry`) departs from the spec's sketched method set on purpose** — documented on
  the trait itself: the two system-entry *writes* are free functions in `infra::entry` over a `&Connection` (they
  must share a transaction with the account row, and both repos share one connection), `exists_non_system_before`
  is named `exists_non_system_on_or_before`, and `last_entry_date` was added for the home-screen cards.
  `06-entries.md` extends this trait rather than adding a second one.
- **Tauri commands** (all registered in `lib.rs`): `list_active_accounts`, `list_archived_accounts`,
  `create_account`, `update_account`, `archive_account`, `unarchive_account`, `delete_account`.
  `archive_account`/`unarchive_account`/`delete_account` return nothing — the caller refetches both lists.
  Create/update take `{ input: { name, color, icon, created_date, opening_balance } }` and `{ id }`;
  `created_date` crosses the wire as a raw ISO string so a bad date is an `AccountError`, not a deserialization
  failure. They return `AccountView { id, name, color, icon, created_date, opening_balance, balance, archived,
  last_entry_date }` with amounts in **major units** and dates as ISO strings — snake_case on the wire, matching
  the existing `DisplaySettings` convention.
