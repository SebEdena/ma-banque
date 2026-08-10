CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    icon TEXT NOT NULL,
    created_date TEXT NOT NULL,
    -- Cents (i64), never a REAL: see technical-architecture.md §1.3.
    opening_balance INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    last_viewed_date TEXT
);
