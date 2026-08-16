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
  with foreign keys enforced by default, so a forward reference to a table that doesn't exist yet fails _every_
  insert into `entries` (verified: "no such table: main.categories"). **The categories feature should create its
  `categories` table with an `INTEGER PRIMARY KEY id`; whichever spec first writes a non-null `category_id` owns
  adding the constraint** (which in SQLite means a table rebuild). `recurring_rule_id` is reserved on the same terms.
- **Money convention (first spec to introduce it):** stored and computed as `i64` cents. `domain::money::to_cents`
  / `to_major` are the only conversion sites. Commands divide once at the boundary; use cases own `f64 -> cents`
  rounding and reject anything finer than a cent. Angular never multiplies, divides, or rounds an amount.
- **Dates are `domain::date::IsoDate`** — a validated `YYYY-MM-DD` newtype whose `Ord` _is_ chronological order
  (fixed-width ISO sorts lexicographically). Any later spec comparing dates should use it rather than raw strings.
- **`AccountError` messages stay in English**, serialized as `{ kind, message }` like `SettingsError`. Angular maps
  each `kind` to French — follow `parseSettingsError` in `core/settings-api` when adding `parseAccountError`.
- **`EntryRepository` (in `domain::entry`) departs from the spec's sketched method set on purpose** — documented on
  the trait itself: the two system-entry _writes_ are free functions in `infra::entry` over a `&Connection` (they
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

### From 02 — Shared icon & color pickers

**The categories feature consumes these as-is — do not build a second copy.** Everything lives under
`src/app/shared/pickers/` (importable as `@shared/pickers/...`):

- `icon-catalog.ts`
  - `ICON_CATALOG: readonly CatalogIcon[]` where `CatalogIcon = { name, svg, keywords }`. 65 hand-curated Lucide
    icons covering banking, housing, transport, food, health, leisure, utilities — sized for categories as well as
    accounts. `name` (e.g. `lucideWallet`) is the value persisted in `accounts.icon` / a future `categories.icon`.
  - `searchIcons(query: string): readonly CatalogIcon[]` — accent- and case-insensitive, matches French keywords
    and the name minus its `lucide` prefix; a blank query returns the whole catalogue.
  - `provideCatalogIcons()` — **any component rendering a user-chosen icon must add this to its `providers`**,
    not just the picker: account cards, category rows, etc. Otherwise ng-icons has nothing registered to draw.
  - `DEFAULT_ICON_NAME` (`lucideWallet`) — what a create form starts on.
- `color-swatches.ts` — `COLOR_SWATCHES: readonly ColorSwatch[]` (`{ value, label }`, 10 hex colours with French
  labels) and `DEFAULT_COLOR`. A closed palette, deliberately: no free colour input.
- `icon-picker/icon-picker.ts` → `<app-icon-picker [value]="…" (selected)="…" />`, selector `app-icon-picker`.
- `color-picker/color-picker.ts` → `<app-color-picker [value]="…" (selected)="…" />`, selector `app-color-picker`.

Both pickers are `input` + `output` (not `model`), matching `OptionToggleGroup`'s existing convention: `value` is
a `string | null` input, `selected` emits the chosen `string`. They are presentational and hold no form state —
the consuming form owns the value. Test hooks: `data-testid="icon-search" | "icon-option" | "icon-empty"` and
`data-testid="color-swatch"`, each option carrying `data-value` and `aria-pressed`.

### From 03 — Home screen: account cards + archive toggle

- **`data/accounts/accounts-api.ts`** — `AccountsApi` (the `invoke()` seam every test mocks, never `invoke()`
  itself), the `Account` and `AccountInput` wire interfaces, and `parseAccountError` (maps each error `kind` to
  French, mirroring `parseSettingsError`). `parseIsoDate` (backend ISO string → **local**-midnight `Date`; plain
  `new Date('2026-01-15')` parses as UTC and renders a day early in negative-offset zones) later moved to
  `shared/iso-date/iso-date.ts` — it's domain-agnostic, not Account-specific.
- **`data/accounts/accounts-store.ts`** — `AccountsStore`, signal-backed: `active()`, `archived()`, `loaded`
  (a promise, like `DisplaySettingsService.loaded` — await it in tests instead of guessing microtasks),
  `reload()`, `archive(id)`. **Both the home screen and the sidebar rail read these same signals** rather than
  fetching independently; that's what satisfies the spec's "the two navigation surfaces never disagree".
  Mutations reload both lists. Tickets 04/05 extend `AccountsApi` + this store with create/update/unarchive/delete.
- **The persistent navigation shell did not exist and was built here — extend it, don't rebuild it.**
  `business-requirements.md` §Navigation specifies the Slack-style sidebar as "the primary navigation structure
  across all screens", but no prior spec built it: `app.html` rendered only a bare `<router-outlet/>`, and
  `02-setup-frontend-ci.md` never mentions one. Confirmed as an unclaimed requirement, not scope creep, before
  building it.
  - **Location**: `src/app/layout/sidebar/sidebar.ts` + `sidebar.html`, selector `app-sidebar`, no inputs or
    outputs — it reads `AccountsStore` itself and is rendered once by `App`, which now wraps the routed outlet in
    `<div class="flex h-screen"><app-sidebar /><main>…</main></div>` behind the data-folder gate.
  - **Current rail**, top to bottom: home link → one entry per **active** account (colour-tinted, chosen icon,
    links to `/account/:id`) → settings link. Deliberately minimal: no breadcrumbs, no collapsing, no header.
  - **To add a destination** (categories' Postes tab, the statistics screen, anything later): add an `<a>` to
    `sidebar.html` alongside the existing home/settings links, register its Lucide icon in the component's
    `provideIcons({…})`, and give it a `data-testid` for tests. Do **not** introduce a second nav component or
    move the rail into a feature folder — the account rail must keep reading the same `AccountsStore` signals the
    home screen renders, which is what stops the two surfaces from disagreeing.
  - Any component added to the rail that renders a user-chosen icon needs `provideCatalogIcons()` in its own
    `providers` (see the From 02 note).
- Home's temporary data-folder proof is gone; `app.routes.spec.ts` now asserts on "Comptes" instead of "Accueil",
  and its `__TAURI_INTERNALS__` stub answers the two list commands with arrays.
- `app.spec.ts` now stubs `AccountsApi`, since the ready-state shell renders the sidebar.
- Test hooks on Home: `account-card` (+`data-account-id`), `account-link`, `account-balance`,
  `account-last-entry`, `archive-account`, `archived-toggle`, `accounts-empty`. On the sidebar:
  `sidebar-account` (+`data-account-id`), `sidebar-home`, `sidebar-settings`.

### From 04 — Account settings modal (create/edit)

- **`features/home/account-settings-modal/`** — one component for both modes, as `06-entries.md` will reuse it from the
  entries screen's "Paramètres" button: `<app-account-settings-modal [account]="…" (saved)="…" (cancelled)="…" />`.
  `account` is `Account | null`; `null` means create. It carries **no delete action** by design.
- It talks to `AccountsStore.create`/`update` itself and emits the saved `Account`; the opener only decides when
  the modal is shown. `AccountsApi` gained `createAccount(input)` / `updateAccount(id, input)`.
- Built on reactive forms (`@angular/forms`) — the first form in this codebase, so it sets the precedent. Native
  `<input type="date">` is what produces the `YYYY-MM-DD` the backend wants, with no date library involved.
  Modal chrome is a plain backdrop plus `cdkTrapFocus` (`@angular/cdk/a11y`) rather than a new spartan dialog
  dependency; Escape and backdrop-click both cancel.
- **A negative opening balance is accepted.** Ticket 04's parenthetical lists "non-numeric/negative opening
  balance" as inline validation, but the backend derives a DEBIT system entry from a negative opening balance
  (`03-accounts.md`'s "type derived from the sign of opening_balance"), so rejecting it client-side would make an
  overdrawn account impossible to open. Only "must be a number" and "name must not be blank" are validated inline;
  everything else comes back from Rust as a toast.
- Test hooks: `account-name`, `account-opening-balance`, `account-created-date` (each with a matching
  `-error` element), `account-save`, `account-cancel`, `modal-backdrop`; on Home, `new-account`.

### From 05 — Archived-accounts view: restore & delete

- **`shared/modal-shell/modal-shell.ts`** — extracted when the confirm dialog would have been the second copy of
  the same chrome. `<app-modal-shell [labelledBy]="…" [panelClass]="…" (dismissed)="…"><!-- content --></app-modal-shell>`
  gives a backdrop, `cdkTrapFocus`, Escape-to-close and backdrop-click-to-close. The account settings modal was
  refactored onto it. **Any future modal (categories, entries) should use this rather than rolling its own.**
- **`shared/confirm-dialog/confirm-dialog.ts`** — `<app-confirm-dialog [title] [message] [confirmLabel]
(confirmed) (cancelled) />`. `message` is the caller's to compose so it can name what's being acted on; test
  hooks `confirm-accept` / `confirm-cancel`.
- `AccountsApi` gained `unarchiveAccount(id)` / `deleteAccount(id)`; `AccountsStore` gained `unarchive(id)` /
  `delete(id)`, both reloading afterwards. Home's archived cards carry `restore-account` and `delete-account`
  (active cards keep `archive-account`); delete opens the confirm dialog and only then calls through.
- The deletion guard stays entirely server-side: the UI always offers delete on an archived card and surfaces
  `HasNonSystemEntries` as a toast if Rust refuses, rather than trying to predict the answer.

### From PR review — why the async layer stays promise-based

Reviewed on request ("use Angular resources & observables, Promises are not the go-to"). The conclusion was to
keep `AccountsApi`/`AccountsStore` as they are; **don't reopen this without new evidence.**

- **Nothing in this feature leaks a promise into template or component state.** Every async result already lands
  in a signal before a template ever reads it — `AccountsStore`'s two list signals and the components' local
  `signal()`s. The remaining promises sit at the `invoke()` boundary and on _command_ methods
  (`create`/`update`/`archive`/`unarchive`/`delete`), which is where a promise is the right shape: a one-shot
  action a click handler awaits, not a value a template renders.
- **`httpResource` does not apply** — there is no HTTP anywhere in the app; all IO is Tauri IPC.
- **RxJS does not apply** — `invoke()` is single-shot, not a stream. There is no polling, no socket, no Tauri
  `listen()`. Wrapping it in `from()` would add an operator layer over a value that arrives exactly once.
- **`resource()` was prototyped over the two lists and rejected.** Three concrete frictions, in order of weight:
  1. `Resource.value()` **throws** `ResourceValueError` in the error state — _even when `defaultValue` is set_
     (`_resource-chunk.mjs`, the `defaultValue`/`throw` branches). Home and the sidebar read those signals
     directly, so any backend failure would throw out of a template instead of degrading to an empty list plus a
     toast, which is the behaviour `03-accounts.md` asks for. Working around it means a `hasValue()` guard on
     every read.
  2. Tauri rejects with a bare `{ kind, message }`, which is not `Error`-like, so `resource` wraps it in a
     `ResourceWrappedError`. `parseAccountError` would need to unwrap `.cause` at every call site.
  3. `reload()` returns a boolean, not a promise, so the mutation methods lose their "both lists are fresh when I
     resolve" guarantee — and it does not settle deterministically in a `TestBed` that has no rendered component,
     which is exactly how `accounts-store.spec.ts` drives the store.
- **`loaded` stays a promise**, matching `DisplaySettingsService.loaded`. It is the deterministic await point the
  specs use; a resource offers no equivalent.
