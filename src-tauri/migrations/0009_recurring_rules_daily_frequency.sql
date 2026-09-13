-- 07-recurring-entries.md follow-up: adds `DAILY` to the frequencies a
-- recurring rule can carry. SQLite cannot alter a CHECK constraint in place,
-- so the table is rebuilt, same technique 0005 used for `entries`' category
-- foreign key.
CREATE TABLE recurring_rules_with_daily (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    category_id INTEGER REFERENCES categories (id),
    type TEXT NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    description TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')),
    "interval" INTEGER NOT NULL CHECK ("interval" >= 1),
    start_date TEXT NOT NULL,
    end_date TEXT
);

INSERT INTO recurring_rules_with_daily
SELECT id, account_id, label, category_id, type, amount, description, frequency, "interval", start_date, end_date
FROM recurring_rules;

DROP TABLE recurring_rules;

ALTER TABLE recurring_rules_with_daily RENAME TO recurring_rules;
