-- 06-entries.md: adds the two columns business requirements §3.3 lists that
-- `entries` doesn't yet have. `DEFAULT ''` on both is a SQLite
-- `ALTER TABLE ... ADD COLUMN NOT NULL` mechanical requirement (it has to
-- backfill every pre-existing row, in particular the system entry, which
-- carries no label) — it is not an invitation for a real entry to be saved
-- with an empty label; that stays enforced as a hard rejection in
-- `usecases::entry`. `description` is genuinely optional: empty is a valid,
-- permanent value there, same as `categories.description`.
ALTER TABLE entries ADD COLUMN label TEXT NOT NULL DEFAULT '';
ALTER TABLE entries ADD COLUMN description TEXT NOT NULL DEFAULT '';
