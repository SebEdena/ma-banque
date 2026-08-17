# 01 — Reconciliation backend

**What to build:** The reconciliation calculation end to end at the backend boundary — storage for `bank_balance`/`statement_date`, the reconciled-balance aggregate, the pure delta/verdict logic, and the summary/write commands. Done when the reconciliation summary (reconciled balance, bank balance, statement date, delta, unreconciled count) can be read and the two settings values written, purely through the command layer.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Migration `migrations/0007_accounts_reconciliation.sql` adds two **nullable** columns to `accounts`: `bank_balance INTEGER` (cents) and `statement_date TEXT` (ISO `YYYY-MM-DD`). Both default to `NULL` for existing and newly created accounts; `create_account`/`update_account` are not changed to seed them.
- [x] New `domain::reconciliation` module with pure functions `delta(bank_balance, reconciled_balance) -> i64` and `is_balanced(delta) -> bool`, mirroring `domain::entry::balance`.
- [x] New narrow `ReconciliationRepository` trait + `infra::reconciliation` implementation, reading/writing `bank_balance`/`statement_date` — **not** added to `AccountRepository`/`AccountDetails`.
- [x] `EntryRepository` gains `sum_reconciled_up_to(account_id, statement_date) -> i64` (signed sum of entries where `reconciled = 1` **or** `is_system = 1`, and `date <= statement_date`) and `count_unreconciled_by_account(account_id) -> i64` (non-system entries where `reconciled = 0`).
- [x] `usecases::reconciliation::reconciliation_summary(account_id)` returns one shape: statement date (optional), bank balance (optional), reconciled balance (optional — absent without a statement date), delta (optional — absent unless both inputs present), `is_balanced`, and the unreconciled count.
- [x] `usecases::reconciliation::set_bank_balance(account_id, amount)` and `set_statement_date(account_id, date)`, each returning the freshly recomputed summary; `set_bank_balance` converts the raw major-unit amount via `money::to_cents` exactly as the opening-balance field does.
- [x] `ReconciliationError` (`thiserror` + `Serialize`, tagged like `AccountError`/`EntryError`): unknown account, invalid amount, invalid date, I/O.
- [x] `commands::reconciliation` exposes `reconciliation_summary`, `set_bank_balance`, `set_statement_date`.
- [x] Domain unit tests for `delta`/`is_balanced`: bank balance above/below/exactly equal to reconciled balance; both negative; both zero — the exactly-equal case asserts `is_balanced` true.
- [x] Use-case tests for `reconciliation_summary` against hand-written in-memory fakes (`ReconciliationRepository`, `EntryRepository`; no `mockall`): a fully-reconciled account reports balanced; a discrepancy reports the signed delta; `NULL` statement date yields no reconciled balance and no delta (not zero, not an error); `NULL` bank balance yields a reconciled balance but no delta; unreconciled count is carried through.
- [x] Use-case tests for `set_bank_balance` (valid amount converted and stored; sub-cent/non-numeric rejected) and `set_statement_date` (valid date stored; malformed rejected), each asserting the returned summary reflects the write.
- [x] SQLite integration tests for `sum_reconciled_up_to`: only reconciled entries counted; entries after the statement date excluded even if reconciled; entries on the statement date exactly included; system entry counted despite being untickable; debits/credits signed correctly; an account with no reconciled entries returns just the opening balance.
- [x] SQLite integration tests for `count_unreconciled_by_account`: counts only non-system unreconciled entries; zero for an account whose every real entry is reconciled.
- [x] Migration test: `0007` applies to a database with pre-existing accounts, leaving both new columns `NULL` on every one.
