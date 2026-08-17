-- 07-recurring-entries.md: the `RecurringRule` entity (règle de périodicité).
--
-- The template columns are deliberately the same names, types, and CHECK
-- constraints as `entries`' — a rule is a stored entry-shaped template, and
-- the two drifting apart would be a bug.
CREATE TABLE recurring_rules (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    category_id INTEGER REFERENCES categories (id),
    type TEXT NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
    -- Cents (i64), always positive: `type` carries the sign.
    amount INTEGER NOT NULL CHECK (amount >= 0),
    description TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL CHECK (frequency IN ('WEEKLY', 'MONTHLY', 'YEARLY')),
    "interval" INTEGER NOT NULL CHECK ("interval" >= 1),
    start_date TEXT NOT NULL,
    end_date TEXT
);

-- The "next occurrence only" edit scope's storage: the same five template
-- columns, shadowing the rule's for one occurrence, then consumed by the
-- generator when it reaches that date.
CREATE TABLE recurring_rule_overrides (
    id INTEGER PRIMARY KEY,
    rule_id INTEGER NOT NULL REFERENCES recurring_rules (id) ON DELETE CASCADE,
    occurrence_date TEXT NOT NULL,
    label TEXT NOT NULL,
    category_id INTEGER REFERENCES categories (id),
    type TEXT NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    description TEXT NOT NULL DEFAULT '',
    UNIQUE (rule_id, occurrence_date)
);

-- The storage half of the idempotency pair (the `last_viewed_date` window is
-- the other): a single rule's occurrences are strictly increasing dates, so
-- this can never reject a legitimate write — it only ever rejects a second
-- attempt at the same occurrence.
--
-- `entries.recurring_rule_id` deliberately gains no REFERENCES clause.
-- 0004 left it unconstrained on the "whichever spec creates the table owns
-- the constraint" reasoning it applied to `category_id`, but SQLite cannot
-- retrofit a foreign key without a full table rebuild, and rebuilding
-- `entries` — the one table carrying the user's money — to gain a constraint
-- the application layer already enforces is a bad trade. `delete_rule` nulls
-- the column out on the entries a deleted rule generated instead, in the same
-- transaction, which also stops a later rule inheriting the id (SQLite reuses
-- max(id) + 1) and colliding with orphaned rows through this index.
CREATE UNIQUE INDEX entries_one_occurrence_per_rule_date
    ON entries (recurring_rule_id, date) WHERE recurring_rule_id IS NOT NULL;
