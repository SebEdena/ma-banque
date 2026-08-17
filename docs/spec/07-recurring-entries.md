# Spec — Recurring Entries

**Status:** ready-for-agent

Complements [00-business-requirements.md](./00-business-requirements.md) (§3.4, §4.3's last bullet) and [technical-architecture.md](../architecture/technical-architecture.md). Blocked by [06-entries.md](./06-entries.md) (the `entries` table shape, `EntryRepository`/`EntryDetails`, the `recurring_rule_id` column it deliberately left reserved and unpopulated, and the account/entries screen this feature hangs its entry point off) and [03-accounts.md](./03-accounts.md) (`last_viewed_date`, reserved there and never written or read since) — both are written and implemented, per [dependencies.md](./dependencies.md). This is the first of the three layer-3 features; it shares no surface with `08-reconciliation.md` or `09-statistics.md` and can land in any order relative to them.

## Problem Statement

Every recurring transaction — rent, salary, a subscription, an annual insurance premium — has to be typed in by hand, every time it comes round. The data model has been anticipating otherwise since `03-accounts.md`: `entries.recurring_rule_id` and `accounts.last_viewed_date` were both reserved as columns and neither has ever been written to, because the entity they point at doesn't exist. `06-entries.md` shipped the register itself and explicitly deferred all of this. Business requirements §4.3's last bullet — "Access to the account's recurring entries configuration" — is the one item on the account screen's feature list with nothing behind it.

The consequence is not only typing. Because nothing generates entries ahead of time, an account's balance only reflects what the user has remembered to enter; the home screen's cards are accurate about the past and silent about the standing commitments that have already come due.

## Solution

Implement the `RecurringRule` entity (_Règle de périodicité_, business requirements §3.4) end to end: per-account rules carrying an entry template plus a schedule, automatic generation of every occurrence due up to today, and a configuration UI reachable from the account screen.

Two things distinguish this feature from the CRUD features before it, and both drive most of the decisions below:

- **The generated entries are ordinary entries.** Once written, an occurrence is an `Entry` like any other — editable, deletable, re-categorizable, with no link back to the rule enforced or surfaced in the register (`06-entries.md`'s user story 16 already committed to this). `recurring_rule_id` is provenance for the generator's own bookkeeping, not a relationship the register honours.
- **Generation runs on a schedule the user never triggers explicitly.** It fires when an account is opened, and again at application startup for every account, so the home screen's balances are current before the user looks at them.

**No prototype exists for this feature.** Business requirements §8 excludes recurring entries from the static mockup ("out of scope for the static prototype; UI/UX to be designed during actual implementation"), so unlike `03`–`06` there is nothing in `docs/design/design.html` to cross-check against. The UI below is invented fresh and is specified at the level of layout, controls, and interaction — deliberately reusing the component vocabulary the account screen already established (the entry form's field set, the category select with its colour/icon swatch, `ConfirmDialog`, the account's accent colour on interactive elements) rather than introducing new patterns, so "consistent with the rest of the app" is achieved by reuse and not by a designer's eye.

## User Stories

1. As a user, I want to define a recurring rule on an account, so that a transaction I know will repeat gets entered once instead of every period.
2. As a user, I want a rule to carry the same fields as a normal entry — label, poste, débit/crédit, montant, description — so that what it generates is indistinguishable from something I would have typed myself.
3. As a user, I want to choose a frequency of weekly, monthly, or yearly, so that the rule matches how the real-world commitment actually recurs.
4. As a user, I want to combine that frequency with an interval, so that "every two months" or "every three weeks" is expressible without a separate frequency for each case.
5. As a user, I want to set a start date, so that the rule begins producing occurrences on the date the real commitment began rather than the day I happened to configure it.
6. As a user, I want to set a start date in the past and have the occurrences I have missed generated immediately, so that adding a rule for something that has been running for months brings my register up to date instead of only covering the future.
7. As a user, I want to leave the end date empty, so that an open-ended commitment doesn't force me to invent a termination date.
8. As a user, I want to set an end date when I know one, so that a fixed-term commitment stops generating on its own.
9. As a user, I want every occurrence due between the last time I looked at the account and today to be generated when I open it, so that the register is complete the moment it renders.
10. As a user, I want that generation to also happen for all my accounts when the application starts, so that the balances on the home screen are already correct before I open anything.
11. As a user, I want an occurrence dated today to be generated too, so that the boundary is inclusive and today's rent doesn't appear only tomorrow.
12. As a user, I want generation to be silent and automatic, so that using the app never involves pressing a "generate" button.
13. As a user, I want to be told how many entries were generated when opening an account produced some, so that entries appearing in the list are explained rather than mysterious.
14. As a user, I want opening the same account twice in a day to generate nothing the second time, so that my balance is never inflated by duplicates.
15. As a user, I want an entry generated from a rule to behave exactly like any other entry once created — editable, deletable, no link back to the rule visible in the register — so that I never have to think about its origin when managing it day to day.
16. As a user, I want to reach the account's recurring rules from the account's own screen, so that configuration lives next to the register it feeds rather than in global settings.
17. As a user, I want to see all of an account's rules in one list, each showing what it generates and how often, so that I can tell at a glance what the account is committed to.
18. As a user, I want to edit a rule, so that a rent increase or a changed payment date doesn't require deleting and recreating it.
19. As a user, I want editing a rule's amount, label, poste, type, or description to ask me whether the change applies only to the next occurrence or to the next and all future ones, so that a one-month exception and a permanent change are both expressible.
20. As a user, I want a change scoped to the next occurrence only to leave the rule itself untouched, so that the period after next goes back to the normal amount without me having to remember to change it back.
21. As a user, I want changing a rule's frequency, interval, start date, or end date to apply to all future occurrences without asking me about scope, so that I'm not asked a question that has no meaningful answer for a schedule change.
22. As a user, I want occurrences already generated to stay exactly as they are when I edit a rule, so that my past register is never rewritten under me.
23. As a user, I want to delete a rule after a confirmation, so that a commitment that has ended stops generating.
24. As a user, I want deleting a rule to leave the entries it already generated in place, so that removing a rule never removes history.
25. As a user, I want an archived account's rules to stop generating, so that archiving an account genuinely stops it moving.
26. As a user, I want a rule with an interval below 1 or an end date before its start date to be rejected as I enter it, so that I can't save a schedule that would produce nothing or loop forever.
27. As a user, I want the rule form's label and montant to be validated exactly like the entry row's, so that money and required fields behave the same wherever I type them.
28. As a user, I want the recurring rules UI to wear the account's accent colour like the rest of the account screen, so that it reads as part of that account and not as a generic dialog.
29. As a user, I want a monthly rule starting on the 31st to generate on the last day of any shorter month and then return to the 31st, so that "the last day of the month" behaves the way I mean it rather than drifting earlier every month.
30. As a user, I want a rule with no occurrence yet due to save and simply generate nothing, so that scheduling something that starts next year is possible.
31. As a developer, I want a `RecurringRuleRepository` trait alongside the existing account/entry/category repositories, so that the feature follows the established data-access pattern rather than reaching into SQLite from a use case.
32. As a developer, I want the "which dates does this rule fall on between X and Y" calculation to be a pure function over a rule and a date window, so that the schedule logic — the part most likely to be wrong — is testable with no repository, no database, and no clock.
33. As a developer, I want "today" passed into the generation use case as a parameter rather than read from the system clock inside it, so that generation is deterministic under test without a clock abstraction.
34. As a developer, I want date arithmetic (add weeks/months/years) on the existing `IsoDate` type, so that this is the only place in the codebase that knows about month lengths and leap years.
35. As a developer, I want recurring-rule business errors as a `thiserror` enum serialized to Angular, so that the UI can show a precise message per failure case, consistent with `AccountError`/`EntryError`/`CategoryError`.
36. As a developer, I want generation to be idempotent at the storage layer as well as by window bookkeeping, so that a bug in the window calculation degrades into "generates nothing extra" rather than "duplicates the user's rent".
37. As a developer, I want a `RecurringRulesApi` service mirroring `EntriesApi`, mocked in component tests and backed by an in-memory implementation for `npm run start:mock`, so that the frontend seam matches every feature before it.

## Implementation Decisions

### Schema

Two new tables and one new index, in `migrations/0007_create_recurring_rules.sql`:

- **`recurring_rules`**: `id`, `account_id` (`NOT NULL REFERENCES accounts (id) ON DELETE CASCADE` — deleting an account already deletes its entries, and a rule outliving its account is meaningless), the template fields mirroring `entries` exactly (`label TEXT NOT NULL`, `category_id INTEGER` nullable `REFERENCES categories (id)`, `type TEXT NOT NULL CHECK (type IN ('DEBIT','CREDIT'))`, `amount INTEGER NOT NULL CHECK (amount >= 0)` in cents with `type` carrying the sign, `description TEXT NOT NULL DEFAULT ''`), and the schedule (`frequency TEXT NOT NULL CHECK (frequency IN ('WEEKLY','MONTHLY','YEARLY'))`, `interval INTEGER NOT NULL CHECK (interval >= 1)`, `start_date TEXT NOT NULL`, `end_date TEXT`). The template columns are deliberately the same names, types, and CHECK constraints as `entries`' — a rule is a stored entry-shaped template, and the two drifting apart would be a bug.
- **`recurring_rule_overrides`**: `id`, `rule_id NOT NULL REFERENCES recurring_rules (id) ON DELETE CASCADE`, `occurrence_date TEXT NOT NULL`, and the same five template columns, all shadowing the rule's for that one occurrence. `UNIQUE (rule_id, occurrence_date)` — one override per occurrence, by construction. This is the "next occurrence only" scope's storage; see below.
- **`entries_one_occurrence_per_rule_date`**: `CREATE UNIQUE INDEX ... ON entries (recurring_rule_id, date) WHERE recurring_rule_id IS NOT NULL`. A single rule's occurrences are strictly increasing dates, so this can never reject a legitimate write — it only ever rejects a second attempt at the same occurrence. It is the storage half of the idempotency pair (below).

`entries.recurring_rule_id` **does not gain a `REFERENCES` clause**. `0004_create_entries.sql` left it unconstrained on the "whichever spec creates the table owns the constraint" reasoning it applied to `category_id`, but the two are not symmetrical: `category_id` was still unconstrained at the point `0005` created `categories`, and SQLite cannot retrofit a foreign key onto an existing column without a full 12-step table rebuild. Rebuilding `entries` — the one table carrying the user's money — to gain a constraint the application layer can enforce is a bad trade. Instead, `delete_rule` **nulls out `recurring_rule_id` on every entry that rule generated, in the same transaction as the delete**. That is also the correct behaviour on its own terms: business requirements §3.4 makes generated occurrences independent, and severing the link is what keeps a later rule from inheriting a deleted rule's `id` (SQLite reuses `max(id) + 1`) and colliding with orphaned rows through the unique index above.

`accounts.last_viewed_date` is written for the first time by this spec; no schema change is needed for it.

### Domain

New module `domain::recurring`:

- `Frequency` (`Weekly` / `Monthly` / `Yearly`), serialized as the same `SCREAMING_SNAKE_CASE` strings the column stores, with the `as_str`/`parse` pair `EntryKind` already models.
- `RuleTemplate` — the five entry-shaped fields, with the amount as `SignedCents` (reusing `domain::entry`'s type, not a parallel one).
- `RuleSchedule` — `frequency`, `interval: u32`, `start_date`, `end_date: Option<IsoDate>`.
- `RecurringRule` (`id`, `account_id`, `template`, `schedule`), `RecurringRuleDetails` (the two halves, as supplied on save), `OccurrenceOverride` (`rule_id`, `occurrence_date`, `template`).
- `RecurringError`, a `thiserror` enum with `#[derive(Serialize)]` per `technical-architecture.md` §1.2: `NotFound`, `EmptyLabel`, `InvalidInterval`, `EndDateBeforeStartDate`, `UnknownCategory`, `InvalidAmount(String)`, `InvalidStoredValue(String)`, `Io(String)`, with `From<InvalidAmount>` mirroring `EntryError`'s.

**`occurrences_between(schedule, from, to) -> Vec<IsoDate>`** is a pure free function in this module, and is the heart of the feature: given a schedule and an inclusive date window, it returns every occurrence date in that window, in ascending order, clipped by `start_date` and `end_date`. It takes no repository, no rule id, and no clock. Everything about the calendar lives here.

**Occurrence dates are anchored, not chained.** The _n_-th occurrence is `start_date` advanced by `n × interval` periods from `start_date` itself, never by one period from the previous occurrence. The difference is only visible at month ends and it matters: a monthly rule starting 2026-01-31 generates 2026-01-31, 2026-02-28, 2026-03-31, 2026-04-30, 2026-05-31 — clamped down to the last day of any shorter month, then back to the 31st — whereas chaining would ratchet permanently down to the 28th after the first February. Yearly rules clamp the same way for 29 February. This is user story 29, and it is the single most important behaviour to get right in this spec.

New arithmetic on `domain::date::IsoDate`: `add_weeks`, `add_months`, `add_years`, all infallible and all clamping the day-of-month to the target month's length using the `days_in_month` helper already in that module. `IsoDate` remains the only type in the codebase that knows about calendar structure.

### Use cases

New module `usecases::recurring`, free functions over `&dyn` repositories, matching `usecases::entry`'s shape:

- `list_rules`, `create_rule`, `update_rule`, `delete_rule` — CRUD over an account's rules. Input validation lives here: label non-blank (trimmed, `EmptyLabel`), `interval >= 1` (`InvalidInterval`), `end_date >= start_date` when present (`EndDateBeforeStartDate`), and the amount arriving as the signed major-unit `f64` the form produced and converted here via `money::to_cents` — the same helper, same rejection rules, and same layer as `usecases::entry::EntryInput::validate`. Category existence relies on the foreign key and surfaces as `UnknownCategory`, exactly as `06-entries.md` decided for entries rather than issuing a redundant existence check.
- `generate_due_for_account(rules, entries, accounts, account_id, today)` — the generator, for one account.
- `generate_due_for_all(accounts, rules, entries, today)` — the startup sweep, iterating active accounts and delegating to the per-account generator.

**The generation window** for an account is `[window_start, today]`, inclusive at both ends, where `window_start` is the account's `last_viewed_date` when set. When it is `NULL` — an account created before this feature existed, or one never opened since — the window opens at each rule's own `start_date`, which makes "add a rule with a start date in the past" (user story 6) generate the whole backlog. Per rule, the effective window is intersected with `[start_date, end_date]` inside `occurrences_between`, so a rule that starts after the window or ended before it simply yields nothing.

After generating, `last_viewed_date` is set to `today` for that account. Both callers stamp it: the startup sweep has genuinely brought every account up to today, so leaving the stamp to account-open only would make the sweep repeat the same work on every launch.

**Archived accounts are skipped** by the sweep and have no open path, so their rules stop generating (user story 25). Their rules are preserved, and unarchiving resumes generation from the archived account's stale `last_viewed_date` — which correctly backfills the period it spent archived, since the underlying commitment did not pause.

**Idempotency is enforced twice, deliberately.** The `last_viewed_date` stamp is the primary mechanism: a second open on the same day computes a window of `[today, today]` and finds every occurrence in it already written. The unique index on `(recurring_rule_id, date)` is the backstop, and the repository's occurrence insert is **insert-if-absent** — a conflict on that index is swallowed and counted as "already generated", not surfaced as an error. This pair is a decision, not redundancy to be tidied away later: the failure mode being defended against is duplicated money in the user's register, and a window-calculation bug is exactly the kind of off-by-one this codebase's own date-boundary history suggests is plausible. With the pair in place, such a bug degrades into "generates nothing extra".

Generated entries are written through `EntryRepository`, with `EntryDetails` gaining `recurring_rule_id: Option<i64>` (a single new field; every existing call site passes `None`) rather than `06-entries.md`'s speculated sibling method. `reconciled` is false on a generated entry — it has not been seen on a statement.

### Edit scope

`update_rule` takes a `scope` alongside the input, and the two scopes do genuinely different things:

- **`AllFuture`** mutates the `recurring_rules` row. Already-generated entries are untouched — they are independent rows and nothing in this path reads them.
- **`NextOccurrenceOnly`** leaves the rule row untouched and writes (or replaces) an `recurring_rule_overrides` row keyed to the rule's **next due occurrence** — the first occurrence strictly after the rule's most recently generated one, or its first occurrence overall if none has been generated. When the generator reaches an occurrence with a matching override, it writes the entry from the override's template instead of the rule's, then the override is consumed (deleted) in the same transaction.

**Scope is only offered for template changes.** Changing `frequency`, `interval`, `start_date`, or `end_date` is always `AllFuture` — "apply this new frequency to the next occurrence only" has no coherent meaning, and the UI does not ask (user story 21). A schedule change additionally **discards that rule's outstanding overrides**, since an override is keyed to a date the new schedule may no longer land on. Overrides whose `occurrence_date` has passed without being consumed are pruned during generation, so a stale override can never resurface months later.

### Commands

New module `commands::recurring`, mirroring `commands::entry`'s boundary conversions — amounts cross the wire as signed major-unit `f64` (`cents as f64 / 100.0` on the way out, raw as-typed on the way in), dates as `YYYY-MM-DD` strings:

- `list_recurring_rules`, `create_recurring_rule`, `update_recurring_rule`, `delete_recurring_rule`
- `open_account(account_id)` — runs `generate_due_for_account` and returns the number of entries generated, so the screen can tell the user (user story 13). This is also the command that stamps `last_viewed_date`; the name says what the frontend is reporting, not what the backend does with it, because later specs may well want more to happen on open.
- `generate_all_due_entries()` — the startup sweep. Returns nothing; the home screen simply reads correct balances.

`today` is resolved at the command layer, once per invocation, and passed down as an `IsoDate`. This requires a new dependency for the **local** civil date — `std` can produce an epoch instant but not a local-timezone calendar date, and a UTC-derived "today" would generate a day early or late for most of the day depending on offset. `chrono` (or `time`; implementer's call, `chrono` being the more common pairing with `rusqlite`) is added, wrapped in a single `infra::clock::today() -> IsoDate` function so exactly one place in the crate touches the system clock and everything downstream takes a date.

### Frontend wiring for generation

Neither generation trigger can live in Tauri's `setup()` hook, and this is a genuine constraint rather than a stylistic choice: on first launch, or when the configured data folder is unreachable, the app runs on `infra::db::placeholder_connection()` and the routed shell is gated behind `App`'s `dataFolderState` while the user answers the folder prompt. Generating against the placeholder connection would do nothing at best. Both triggers are therefore frontend-invoked commands:

- **Startup**: `App` calls `RecurringRulesApi.generateAllDue()` once `dataFolderState` resolves to `ready`, and awaits it before rendering the routed shell — `AccountsStore` loads in its own constructor, so a sweep that has not finished first would leave the home screen's cards showing pre-generation balances.
- **Account open**: `Account` awaits `RecurringRulesApi.openAccount(accountId)` before its first `listEntries` call, then proceeds through its existing load path. A non-zero count raises an informational toast ("N écritures générées"); zero says nothing. If `openAccount` rejects, the failure is toasted and the register still loads — a generation failure must not make the account unreadable.

### Frontend UI

`RecurringRulesApi` lives at `src/app/data/recurring-rules/`, mirroring `EntriesApi` in shape: an injectable wrapping `invoke()`, a `parseRecurringError` covering every `RecurringError` kind in the same file, and an `InMemoryRecurringRulesApi` sibling wired into `app.config.ts`'s `mockProviders` so `npm run start:mock` exercises the whole feature without a backend.

The entry point (business requirements §4.3's last bullet) is a **toolbar button on the account screen**, sitting beside "Nouvelle écriture" and styled the same way, labelled **"Écritures périodiques"**. It opens a modal — not a route — because the configuration belongs to the account whose register is behind it, and because every other configuration surface in this app (account settings, poste creation) is already a modal.

The modal has two states:

- **List**: the account's rules, one row each, showing the poste swatch, the label, the signed amount (through the existing `currency-format` pipe), and a plain-language schedule summary — "Tous les mois", "Tous les 2 mois", "Toutes les 3 semaines", "Tous les ans" — plus the date range ("depuis le 01/03/2026", "du 01/03/2026 au 31/12/2026"). Each row has edit and delete affordances; the delete confirmation reuses `ConfirmDialog` exactly as the entry row's does. An empty list shows an empty state and the create affordance, not a bare panel.
- **Form**: the same modal, switched to a rule editor. Its top half is the entry template and deliberately reuses the field vocabulary `EntryForm` established — label, the native poste `<select>` with its colour/icon swatch beside it, the débit/crédit selector paired with the amount field and the same sign-synchronisation behaviour, and the description — so a rule reads as "an entry, plus a schedule". Its bottom half is the schedule: a frequency select (Hebdomadaire / Mensuelle / Annuelle), an interval number input, and start/end date inputs with the end date clearable. Field-level validation (empty label, unreadable amount, interval below 1, end date before start date) renders inline next to the offending field; command rejections toast. This is `technical-architecture.md` §2.2's default split, not a deviation.

Whether the rule form is a distinct component or a reuse/generalisation of `EntryForm` is the implementer's call — `EntryForm` is currently tightly coupled to the register row's `display: contents` layout and its Signal Forms schema, so a separate component sharing only `parseAmount` and the swatch logic is a defensible reading of "reuse the vocabulary". Duplicating the amount-parsing rules is not.

Saving an edit that changed **any template field** opens the scope dialog before the write: two clearly-worded choices ("Uniquement la prochaine occurrence" / "La prochaine et toutes les suivantes") plus cancel. It is skipped entirely when only schedule fields changed, and when creating a rule. The screen's `--account-color` is bound on the modal root and its controls carry the existing `data-accent` / `data-accent-solid` opt-in attributes, so the whole surface picks up the account's accent with no new styling rules (user story 28).

## Testing Decisions

- **Domain unit tests for `IsoDate` arithmetic**: `add_weeks` across a month and a year boundary; `add_months` clamping 31 January to 28 February in a common year and 29 February in a leap year; `add_months` crossing a year boundary; `add_years` clamping 29 February to 28 February; and each of the three preserving a mid-month day unchanged. These extend `domain::date`'s existing test module.
- **Domain unit tests for `occurrences_between`**, the deepest and most valuable seam — no repository, no database, no clock: weekly/monthly/yearly with `interval = 1` and with `interval > 1`; a window entirely before `start_date` and one entirely after `end_date` (both empty); a window whose bounds fall exactly on occurrences (both included — the boundary is inclusive at both ends); an occurrence falling exactly on `end_date` (included) and one the day after (excluded); a single-day window that is an occurrence and one that isn't; a rule with `end_date = None` running to the window's far edge; and the anchored-not-chained series 2026-01-31 → 2026-02-28 → 2026-03-31 → 2026-04-30, asserted as one sequence rather than as isolated steps.
- **Use case tests for generation** against hand-written in-memory fake `RecurringRuleRepository`, `EntryRepository`, and `AccountRepository` (no `mockall`, per `technical-architecture.md` §1.6), with `today` passed as a literal date so every case is deterministic: generation from a set `last_viewed_date`; generation from `NULL` `last_viewed_date` backfilling from each rule's `start_date`; an occurrence dated exactly `today` being generated; running the same generation twice producing no second entry (asserting the entry count, not just the absence of an error); generated entries carrying `recurring_rule_id` and `reconciled = false`; the template's label/category/type/amount/description landing on the generated entry verbatim; `last_viewed_date` being stamped to `today` afterwards; an account with no rules being a no-op that still stamps; the all-accounts sweep covering every active account and skipping archived ones; and an outstanding override being applied to its one occurrence, consumed afterwards, and the following occurrence reverting to the rule's template.
- **Use case tests for rule CRUD** against the same fakes: empty/whitespace label rejected as `EmptyLabel`; `interval = 0` rejected as `InvalidInterval`; `end_date` earlier than `start_date` rejected as `EndDateBeforeStartDate`; `end_date` equal to `start_date` accepted; an amount `money::to_cents` rejects surfacing as `InvalidAmount`; `update_rule` with `AllFuture` mutating the rule and leaving already-generated entries untouched; `update_rule` with `NextOccurrenceOnly` leaving the rule untouched and writing an override on the correct next-due date (both for a rule that has generated occurrences and one that has not); a schedule change discarding the rule's outstanding overrides; and `delete_rule` leaving the rule's generated entries in place.
- **SQLite integration tests for `SqliteRecurringRuleRepository`** against a fresh `:memory:` database with all migrations (through `0007`) applied per test, following `infra::entry`'s existing test module: rule create/read/update/delete round-trips including the `None` `end_date` and `None` `category_id` cases; deleting an account cascading its rules away; an unknown `category_id` surfacing as `UnknownCategory`; override insert/replace respecting `UNIQUE (rule_id, occurrence_date)`; deleting a rule cascading its overrides and nulling `recurring_rule_id` on the entries it generated while leaving those entries present; and the occurrence insert being insert-if-absent — a second insert for the same `(recurring_rule_id, date)` reporting "already present" rather than erroring or duplicating.
- **Angular component tests (Vitest)** with `RecurringRulesApi` mocked, never `invoke()` directly, per the seam every feature since `03-accounts.md` has used: the rules modal renders a list from the mocked Api and shows its empty state when there are none; creating a rule calls `createRecurringRule` with the form's values; editing a template field opens the scope dialog and the chosen scope reaches `updateRecurringRule`; editing only a schedule field skips the dialog; deleting calls `deleteRecurringRule` behind `ConfirmDialog`; each of the four field-level validations renders inline without calling the Api; `Account` calls `openAccount` before its first `listEntries` and toasts a non-zero generated count; `Account` still renders its register when `openAccount` rejects; and `App` calls `generateAllDue` after the data folder resolves and before the routed shell renders.
- **E2E (WebdriverIO, `e2e/recurring-entries.e2e.ts`)**, sharing the session per `technical-architecture.md` §2.3 and picking up from `ensureRoutedShell()`, asserting on `data-testid` hooks: open an account, open the recurring rules modal from the account toolbar, create a monthly rule with a start date some months in the past, close the modal and confirm the backfilled entries are now in the register; reopen the modal, edit the rule's amount with the "next occurrence only" scope and confirm the rule row still shows the original amount; delete the rule behind its confirmation and confirm the previously generated entries are still in the register. The startup sweep is exercised **through the account-open path**, not by restarting the app — the WDIO suite shares one session and one launch, so a genuine startup trigger isn't observable from inside it; the sweep's own behaviour is covered by the all-accounts use case test above.

## Out of Scope

- **Editing or deleting a single already-generated occurrence as an occurrence.** Once generated, it is an ordinary entry and `06-entries.md`'s register owns it — including deleting it, which does not prevent the same occurrence being generated again should the window ever cover it a second time (the unique index guards against duplicates, not against a deliberate re-generation after a manual delete). Skipping a future occurrence outright ("pause this month") is not in business requirements §3.4 and is not built.
- **Any indication in the register that an entry came from a rule** — no badge, no filter, no link. `06-entries.md` user story 16 committed to this and this spec honours it; `recurring_rule_id` is written but never surfaced.
- **Rules spanning accounts, or global rules.** Business requirements §3.4 scopes a rule to one `account_id`.
- **Daily, quarterly, or arbitrary-cron frequencies.** §3.4 lists exactly three frequencies; `interval` covers "every 2 months" and "every 3 weeks" without adding any.
- **Notifications, reminders, or a preview of upcoming occurrences.** The rules list shows the schedule; it does not project a calendar of what is coming.
- **The reconciliation panel and its aggregates** (§3.5) — `08-reconciliation.md`. Generated entries are simply unreconciled.
- **Statistics** (§4.5) — `09-statistics.md`.

## Further Notes

- **`occurrences_between` is where the bugs will be**, and it is the one function in this spec with no repository, no I/O, and no clock between the test and the logic. Review its tests before its implementation; the anchored-not-chained month-end rule in particular is easy to implement by accident as chained, and the difference only shows up in a series longer than two occurrences, which is why the test above asserts a four-element sequence rather than isolated steps.
- **The `chrono` dependency is this spec's only new crate**, and it exists solely to answer "what is today's local date". Wrapping it in `infra::clock::today()` keeps the crate's clock surface to one function; if a later spec wants a fixed clock for anything, that's the single place to widen.
- `08-reconciliation.md` and `09-statistics.md` both read entries and are unaffected by this spec's schema additions — generated occurrences are ordinary rows to both. The only shared surface is `EntryDetails`' new `recurring_rule_id` field, which neither needs to set.
- `accounts.last_viewed_date` finally has both a writer and a reader after being carried unused since `03-accounts.md`. It now means "the date through which this account's recurring occurrences have been generated" and nothing else — it is not a general "last opened" timestamp, and later specs should not read it as one.
- Because this feature has no prototype to check against, its UI is the first in the project that later work can't cross-reference to `docs/design/design.html`. Whatever ships here becomes the reference for it; a screenshot in the implementation notes would be worth more than usual.
