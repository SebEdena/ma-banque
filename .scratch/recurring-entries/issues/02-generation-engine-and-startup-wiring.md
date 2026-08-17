# 02 — Generation engine + startup/account-open wiring

**What to build:** Automatic generation of due occurrences, triggered on app startup (all accounts) and on opening an account (that account), with idempotency guarantees. Done when opening an account with an overdue rule backfills the missing entries and starting the app brings every account's balance current before the home screen renders.

**Blocked by:** 01 — needs the rule repository, schema, and `EntryDetails`/`EntryRepository` surfaces.

**Status:** ready-for-agent

- [ ] `EntryDetails` gains `recurring_rule_id: Option<i64>`; every existing call site passes `None`.
- [ ] `usecases::recurring::generate_due_for_account(rules, entries, accounts, account_id, today)`: generation window is `[last_viewed_date ?? rule.start_date, today]` inclusive; writes generated entries via `EntryRepository` with `reconciled = false`; applies any outstanding override for an occurrence it reaches, then consumes (deletes) that override; stamps `last_viewed_date = today` on the account afterward, even when nothing was generated.
- [ ] `usecases::recurring::generate_due_for_all(accounts, rules, entries, today)`: iterates active (non-archived) accounts, delegating to the per-account generator; archived accounts are skipped and generate nothing.
- [ ] Idempotency: running generation twice for the same account/day produces no duplicate entries (verified by entry count, not just absence of an error) — enforced by the `last_viewed_date` stamp as the primary mechanism and the insert-if-absent occurrence write (from ticket 01) as the backstop.
- [ ] `commands::recurring::open_account(account_id)` runs `generate_due_for_account` and returns the count of entries generated.
- [ ] `commands::recurring::generate_all_due_entries()` runs `generate_due_for_all` for every account; returns nothing.
- [ ] `today` is resolved once per command invocation via `infra::clock::today()` and passed down as a plain parameter — no clock reads inside the use case.
- [ ] `App` calls `generateAllDue()` once the data-folder state resolves to ready, and awaits it before rendering the routed shell (so `AccountsStore`'s balances are never shown pre-generation).
- [ ] `Account` awaits `openAccount(accountId)` before its first `listEntries` call; a non-zero generated count raises an informational toast ("N écritures générées"); zero generates no toast; if `openAccount` rejects, the failure is toasted but the register still loads.
- [ ] Use-case tests against hand-written in-memory fakes (`RecurringRuleRepository`, `EntryRepository`, `AccountRepository`), with `today` passed as a literal date: generation from a set `last_viewed_date`; generation from `NULL` `last_viewed_date` backfilling from each rule's `start_date`; an occurrence dated exactly `today` is generated; running generation twice produces no second entry; generated entries carry `recurring_rule_id` and `reconciled = false`, with template fields landing verbatim; `last_viewed_date` is stamped to `today` afterward, including for an account with no rules; the all-accounts sweep covers every active account and skips archived ones; an outstanding override is applied to its one occurrence, consumed afterward, and the following occurrence reverts to the rule's template.
- [ ] Angular component tests (Vitest, mocking `RecurringRulesApi`/`EntriesApi`, never `invoke()` directly): `Account` calls `openAccount` before its first `listEntries` and toasts a non-zero generated count; `Account` still renders its register when `openAccount` rejects; `App` calls `generateAllDue` after the data folder resolves and before the routed shell renders.
