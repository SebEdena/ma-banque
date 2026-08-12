CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    icon TEXT NOT NULL,
    -- Optional in the UI, stored as '' rather than NULL so every read gets a
    -- string. No parent_id in v1 (business requirements §3.2): adding one
    -- later is a pure additive migration.
    description TEXT NOT NULL DEFAULT ''
);

-- The starting list from business requirements §6, seeded here rather than at
-- startup so a fresh database gets them exactly once, deterministically. These
-- are ordinary rows from this point on — freely editable and deletable, with
-- no flag marking them as preset.
INSERT INTO categories (name, color, icon, description) VALUES
    ('Alimentation', '#4ADE80', 'shopping-cart', 'Courses, supermarché, marché'),
    ('Logement', '#60A5FA', 'home', 'Loyer, charges, assurance habitation'),
    ('Transport', '#FB923C', 'car', 'Essence, transports en commun, entretien'),
    ('Restaurant / Sorties', '#F472B6', 'utensils', 'Restaurants, cafés, bars'),
    ('Loisirs', '#A78BFA', 'party-popper', 'Cinéma, sport, activités'),
    ('Santé', '#F87171', 'heart-pulse', 'Pharmacie, médecin, mutuelle'),
    ('Shopping / Habillement', '#FBBF24', 'shirt', 'Vêtements, accessoires'),
    ('Abonnements', '#38BDF8', 'repeat', 'Streaming, logiciels, presse'),
    ('Salaire', '#34D399', 'banknote', 'Revenus du travail'),
    ('Épargne / Investissement', '#818CF8', 'piggy-bank', 'Virements vers l''épargne'),
    ('Impôts / Taxes', '#94A3B8', 'landmark', 'Impôts, taxes, cotisations'),
    ('Divers', '#A8A29E', 'more-horizontal', 'Non catégorisé');

-- `entries.category_id` was created without its REFERENCES clause because
-- `categories` didn't exist yet (see 0004); SQLite can't add a foreign key to
-- an existing column, so the table is rebuilt here to pick it up. Every
-- existing `category_id` is NULL at this point — nothing references a
-- category until 06-entries.md.
CREATE TABLE entries_with_category_fk (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    is_system INTEGER NOT NULL DEFAULT 0,
    category_id INTEGER REFERENCES categories (id),
    reconciled INTEGER NOT NULL DEFAULT 0,
    recurring_rule_id INTEGER
);

INSERT INTO entries_with_category_fk
SELECT id, account_id, date, type, amount, is_system, category_id, reconciled, recurring_rule_id
FROM entries;

DROP TABLE entries;

ALTER TABLE entries_with_category_fk RENAME TO entries;

CREATE INDEX entries_account_date ON entries (account_id, date);

CREATE UNIQUE INDEX entries_one_system_per_account ON entries (account_id) WHERE is_system = 1;
