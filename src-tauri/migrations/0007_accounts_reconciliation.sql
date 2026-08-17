-- 08-reconciliation.md: the two per-account settings values reconciliation
-- needs. Both are deliberately nullable with no default — `NULL` is the
-- first-class "the user has not told us this yet" state, not a placeholder:
-- a `NULL` statement_date means the reconciled balance is not computed at
-- all (rather than guessed at), and a `NULL` bank_balance means the delta
-- isn't either. `create_account` is not changed to seed them.
ALTER TABLE accounts ADD COLUMN bank_balance INTEGER;
ALTER TABLE accounts ADD COLUMN statement_date TEXT;
