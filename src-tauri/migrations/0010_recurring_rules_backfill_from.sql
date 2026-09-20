-- A one-time "backfill from" marker for a rule whose schedule was just
-- edited (07-recurring-entries.md follow-up). Generation normally opens a
-- rule's window at the account's last-viewed date once the rule has produced
-- at least one occurrence, so moving `start_date` earlier on an existing
-- rule would otherwise never backfill the newly-in-range past occurrences.
-- Nullable with no default, mirroring `recurring_rule_overrides`: `NULL`
-- means there is nothing to backfill, which is true for every rule until its
-- schedule is edited, and again immediately after the next generation run
-- consumes it.
ALTER TABLE recurring_rules ADD COLUMN backfill_from TEXT;
