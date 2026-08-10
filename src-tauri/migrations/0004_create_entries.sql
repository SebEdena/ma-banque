-- Minimal shape needed by 03-accounts.md: enough to hold each account's
-- opening-balance system entry and compute a balance. 06-entries.md extends
-- this table rather than replacing it.
CREATE TABLE entries (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
    -- Cents (i64), always positive: `type` carries the sign.
    amount INTEGER NOT NULL CHECK (amount >= 0),
    is_system INTEGER NOT NULL DEFAULT 0,
    -- Reserved for 04-categories.md so 06-entries.md needs no schema change
    -- to start using it. Always NULL here: a system entry has no category.
    -- No REFERENCES clause: this build of SQLite enforces foreign keys by
    -- default, so pointing at a table that doesn't exist yet would fail
    -- every insert. Whichever spec creates `categories` owns the constraint.
    category_id INTEGER,
    reconciled INTEGER NOT NULL DEFAULT 0,
    -- Reserved for 07-recurring-entries.md, on the same terms.
    recurring_rule_id INTEGER
);

CREATE INDEX entries_account_date ON entries (account_id, date);

-- An account has exactly one opening-balance entry, for its whole lifetime.
CREATE UNIQUE INDEX entries_one_system_per_account ON entries (account_id) WHERE is_system = 1;
