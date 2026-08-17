//! SQLite access to `recurring_rules` and `recurring_rule_overrides` (see
//! `migrations/0008_create_recurring_rules.sql`), plus the occurrence write
//! into `entries`.
//!
//! Two write paths here are deliberately more than a single statement:
//! `delete` severs `entries.recurring_rule_id` in the same transaction as the
//! rule row it removes (so a rule's history survives it, and a later rule
//! reusing the id can't collide with orphans), and
//! `insert_occurrence_if_absent` leans on the partial unique index to make a
//! repeated occurrence a no-op rather than duplicated money.

use rusqlite::{Connection, OptionalExtension, Row};

use crate::domain::date::IsoDate;
use crate::domain::entry::{EntryKind, SignedCents};
use crate::domain::recurring::{
    Frequency, OccurrenceOverride, RecurringError, RecurringRule, RecurringRuleDetails,
    RecurringRuleRepository, RuleSchedule, RuleTemplate,
};
use crate::infra::db::SharedConnection;

const RULE_COLUMNS: &str = "id, account_id, label, category_id, type, amount, description, \
     frequency, \"interval\", start_date, end_date";

const OVERRIDE_COLUMNS: &str =
    "rule_id, occurrence_date, label, category_id, type, amount, description";

fn io_err<E: std::fmt::Display>(e: E) -> RecurringError {
    RecurringError::Io(e.to_string())
}

/// Maps a foreign-key violation to [`RecurringError::UnknownCategory`];
/// anything else is a plain I/O failure.
///
/// SQLite reports every foreign key the same way ("FOREIGN KEY constraint
/// failed"), with no column in the message, so `category_id` is only the
/// culprit when the write actually carried one — `account_id` is the other
/// foreign key on these tables, and reporting a bad account as an unknown
/// category would send the UI chasing the wrong field.
fn map_write_error(e: rusqlite::Error, category_id: Option<i64>) -> RecurringError {
    if let rusqlite::Error::SqliteFailure(ref sqlite_err, Some(ref message)) = e {
        if sqlite_err.code == rusqlite::ErrorCode::ConstraintViolation
            && message.contains("FOREIGN KEY")
            && category_id.is_some()
        {
            return RecurringError::UnknownCategory;
        }
    }
    io_err(e)
}

/// Whether `e` is the partial unique index on `entries (recurring_rule_id,
/// date)` rejecting an occurrence this rule has already generated — the one
/// conflict [`SqliteRecurringRuleRepository::insert_occurrence_if_absent`]
/// swallows.
///
/// Matched on that exact pair of columns (SQLite names the columns, not the
/// index) rather than with `INSERT OR IGNORE`, which would equally silently
/// drop a genuine CHECK or NOT NULL failure and report it as "already
/// generated" — turning a real write problem into a silently missing entry.
/// No other constraint on `entries` covers these two columns together.
fn is_duplicate_occurrence(e: &rusqlite::Error) -> bool {
    matches!(
        e,
        rusqlite::Error::SqliteFailure(sqlite_err, Some(message))
            if sqlite_err.code == rusqlite::ErrorCode::ConstraintViolation
                && message.contains("entries.recurring_rule_id")
                && message.contains("entries.date")
    )
}

fn parse_stored_date(raw: &str) -> Result<IsoDate, RecurringError> {
    IsoDate::parse(raw).map_err(|e| RecurringError::InvalidStoredValue(e.to_string()))
}

/// Reads the five template columns starting at `offset`. The outer `Result`
/// is SQLite's (the row couldn't be read at all); the inner one is ours (the
/// row was read but holds a value the domain rejects) — the same split
/// `infra::account` uses, so a malformed row is an error rather than a panic
/// inside `rusqlite`'s row-mapping closure.
fn to_template(
    row: &Row<'_>,
    offset: usize,
) -> rusqlite::Result<Result<RuleTemplate, RecurringError>> {
    let label: String = row.get(offset)?;
    let category_id: Option<i64> = row.get(offset + 1)?;
    let kind: String = row.get(offset + 2)?;
    let amount: i64 = row.get(offset + 3)?;
    let description: String = row.get(offset + 4)?;

    Ok(Ok(RuleTemplate {
        label,
        category_id,
        amount: SignedCents {
            kind: match EntryKind::parse(&kind) {
                Ok(kind) => kind,
                Err(e) => return Ok(Err(RecurringError::InvalidStoredValue(e.to_string()))),
            },
            amount,
        },
        description,
    }))
}

fn to_rule(row: &Row<'_>) -> rusqlite::Result<Result<RecurringRule, RecurringError>> {
    let id = row.get(0)?;
    let account_id = row.get(1)?;
    let template = match to_template(row, 2)? {
        Ok(template) => template,
        Err(e) => return Ok(Err(e)),
    };
    let frequency: String = row.get(7)?;
    let interval: i64 = row.get(8)?;
    let start_date: String = row.get(9)?;
    let end_date: Option<String> = row.get(10)?;

    Ok(Ok(RecurringRule {
        id,
        account_id,
        template,
        schedule: RuleSchedule {
            frequency: match Frequency::parse(&frequency) {
                Ok(frequency) => frequency,
                Err(e) => return Ok(Err(e)),
            },
            // `CHECK ("interval" >= 1)` on the column is what makes this
            // cast safe.
            interval: interval as u32,
            start_date: match parse_stored_date(&start_date) {
                Ok(date) => date,
                Err(e) => return Ok(Err(e)),
            },
            end_date: match end_date.as_deref().map(parse_stored_date).transpose() {
                Ok(date) => date,
                Err(e) => return Ok(Err(e)),
            },
        },
    }))
}

fn to_override(row: &Row<'_>) -> rusqlite::Result<Result<OccurrenceOverride, RecurringError>> {
    let rule_id = row.get(0)?;
    let occurrence_date: String = row.get(1)?;
    let template = match to_template(row, 2)? {
        Ok(template) => template,
        Err(e) => return Ok(Err(e)),
    };

    Ok(Ok(OccurrenceOverride {
        rule_id,
        occurrence_date: match parse_stored_date(&occurrence_date) {
            Ok(date) => date,
            Err(e) => return Ok(Err(e)),
        },
        template,
    }))
}

fn find_in(conn: &Connection, id: i64) -> Result<Option<RecurringRule>, RecurringError> {
    conn.query_row(
        &format!("SELECT {RULE_COLUMNS} FROM recurring_rules WHERE id = ?1"),
        [id],
        to_rule,
    )
    .optional()
    .map_err(io_err)?
    .transpose()
}

pub struct SqliteRecurringRuleRepository {
    conn: SharedConnection,
}

impl SqliteRecurringRuleRepository {
    pub fn new(conn: SharedConnection) -> Self {
        Self { conn }
    }
}

impl RecurringRuleRepository for SqliteRecurringRuleRepository {
    fn list_by_account(&self, account_id: i64) -> Result<Vec<RecurringRule>, RecurringError> {
        let conn = self.conn.lock().unwrap();
        let mut statement = conn
            .prepare(&format!(
                "SELECT {RULE_COLUMNS} FROM recurring_rules WHERE account_id = ?1 ORDER BY id"
            ))
            .map_err(io_err)?;

        let rows = statement
            .query_map([account_id], to_rule)
            .map_err(io_err)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(io_err)?;

        rows.into_iter().collect()
    }

    fn find(&self, id: i64) -> Result<Option<RecurringRule>, RecurringError> {
        find_in(&self.conn.lock().unwrap(), id)
    }

    fn create(
        &self,
        account_id: i64,
        details: &RecurringRuleDetails,
    ) -> Result<RecurringRule, RecurringError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO recurring_rules \
             (account_id, label, category_id, type, amount, description, frequency, \"interval\", start_date, end_date) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                account_id,
                details.template.label,
                details.template.category_id,
                details.template.amount.kind.as_str(),
                details.template.amount.amount,
                details.template.description,
                details.schedule.frequency.as_str(),
                details.schedule.interval,
                details.schedule.start_date.as_str(),
                details.schedule.end_date.as_ref().map(IsoDate::as_str),
            ],
        )
        .map_err(|e| map_write_error(e, details.template.category_id))?;

        let id = conn.last_insert_rowid();
        find_in(&conn, id)?
            .ok_or_else(|| RecurringError::Io("recurring rule vanished after insert".to_owned()))
    }

    fn update(
        &self,
        id: i64,
        details: &RecurringRuleDetails,
    ) -> Result<RecurringRule, RecurringError> {
        let conn = self.conn.lock().unwrap();
        let affected = conn
            .execute(
                "UPDATE recurring_rules SET label = ?1, category_id = ?2, type = ?3, amount = ?4, \
                 description = ?5, frequency = ?6, \"interval\" = ?7, start_date = ?8, end_date = ?9 \
                 WHERE id = ?10",
                rusqlite::params![
                    details.template.label,
                    details.template.category_id,
                    details.template.amount.kind.as_str(),
                    details.template.amount.amount,
                    details.template.description,
                    details.schedule.frequency.as_str(),
                    details.schedule.interval,
                    details.schedule.start_date.as_str(),
                    details.schedule.end_date.as_ref().map(IsoDate::as_str),
                    id,
                ],
            )
            .map_err(|e| map_write_error(e, details.template.category_id))?;

        if affected == 0 {
            return Err(RecurringError::NotFound);
        }
        find_in(&conn, id)?.ok_or(RecurringError::NotFound)
    }

    fn delete(&self, id: i64) -> Result<(), RecurringError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(io_err)?;

        // Severs the provenance link *before* the rule goes, so the entries
        // it generated survive it and a later rule inheriting this id (SQLite
        // reuses max(id) + 1) can't collide with them through the partial
        // unique index.
        tx.execute(
            "UPDATE entries SET recurring_rule_id = NULL WHERE recurring_rule_id = ?1",
            [id],
        )
        .map_err(io_err)?;

        // Overrides go with the rule through `ON DELETE CASCADE`.
        let affected = tx
            .execute("DELETE FROM recurring_rules WHERE id = ?1", [id])
            .map_err(io_err)?;
        if affected == 0 {
            return Err(RecurringError::NotFound);
        }

        tx.commit().map_err(io_err)
    }

    fn list_overrides(&self, rule_id: i64) -> Result<Vec<OccurrenceOverride>, RecurringError> {
        let conn = self.conn.lock().unwrap();
        let mut statement = conn
            .prepare(&format!(
                "SELECT {OVERRIDE_COLUMNS} FROM recurring_rule_overrides \
                 WHERE rule_id = ?1 ORDER BY occurrence_date"
            ))
            .map_err(io_err)?;

        let rows = statement
            .query_map([rule_id], to_override)
            .map_err(io_err)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(io_err)?;

        rows.into_iter().collect()
    }

    fn save_override(&self, occurrence: &OccurrenceOverride) -> Result<(), RecurringError> {
        // `UNIQUE (rule_id, occurrence_date)` makes "one override per
        // occurrence" true by construction; REPLACE is how a second edit of
        // the same occurrence supersedes the first.
        self.conn
            .lock()
            .unwrap()
            .execute(
                "INSERT OR REPLACE INTO recurring_rule_overrides \
                 (rule_id, occurrence_date, label, category_id, type, amount, description) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    occurrence.rule_id,
                    occurrence.occurrence_date.as_str(),
                    occurrence.template.label,
                    occurrence.template.category_id,
                    occurrence.template.amount.kind.as_str(),
                    occurrence.template.amount.amount,
                    occurrence.template.description,
                ],
            )
            .map(|_| ())
            .map_err(|e| map_write_error(e, occurrence.template.category_id))
    }

    fn delete_override(
        &self,
        rule_id: i64,
        occurrence_date: &IsoDate,
    ) -> Result<(), RecurringError> {
        self.conn
            .lock()
            .unwrap()
            .execute(
                "DELETE FROM recurring_rule_overrides WHERE rule_id = ?1 AND occurrence_date = ?2",
                rusqlite::params![rule_id, occurrence_date.as_str()],
            )
            .map(|_| ())
            .map_err(io_err)
    }

    fn delete_overrides(&self, rule_id: i64) -> Result<(), RecurringError> {
        self.conn
            .lock()
            .unwrap()
            .execute(
                "DELETE FROM recurring_rule_overrides WHERE rule_id = ?1",
                [rule_id],
            )
            .map(|_| ())
            .map_err(io_err)
    }

    fn last_generated_date(&self, rule_id: i64) -> Result<Option<IsoDate>, RecurringError> {
        let raw: Option<String> = self
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT MAX(date) FROM entries WHERE recurring_rule_id = ?1",
                [rule_id],
                |row| row.get(0),
            )
            .map_err(io_err)?;

        raw.as_deref().map(parse_stored_date).transpose()
    }

    fn insert_occurrence_if_absent(
        &self,
        rule_id: i64,
        account_id: i64,
        date: &IsoDate,
        template: &RuleTemplate,
    ) -> Result<bool, RecurringError> {
        let result = self
            .conn
            .lock()
            .unwrap()
            .execute(
                "INSERT INTO entries \
                 (account_id, label, category_id, date, type, amount, description, is_system, reconciled, recurring_rule_id) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, ?8)",
                rusqlite::params![
                    account_id,
                    template.label,
                    template.category_id,
                    date.as_str(),
                    template.amount.kind.as_str(),
                    template.amount.amount,
                    template.description,
                    rule_id,
                ],
            );

        match result {
            Ok(_) => Ok(true),
            // The one swallowed failure: this occurrence is already in the
            // register. Every other failure still surfaces, so a real write
            // problem can't masquerade as "already generated".
            Err(e) if is_duplicate_occurrence(&e) => Ok(false),
            Err(e) => Err(map_write_error(e, template.category_id)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::account::{AccountDetails, AccountRepository};
    use crate::infra::account::SqliteAccountRepository;
    use crate::infra::db;

    fn fixture() -> (SharedConnection, i64) {
        let conn = db::migrated_in_memory_connection();
        let account = SqliteAccountRepository::new(conn.clone())
            .create(&AccountDetails {
                name: "Compte courant".to_owned(),
                color: "#3b82f6".to_owned(),
                icon: "wallet".to_owned(),
                created_date: IsoDate::parse("2026-01-01").unwrap(),
                opening_balance: 100_000,
            })
            .unwrap();
        (conn, account.id)
    }

    fn details(label: &str, cents: i64, end_date: Option<&str>) -> RecurringRuleDetails {
        RecurringRuleDetails {
            template: RuleTemplate {
                label: label.to_owned(),
                category_id: None,
                amount: SignedCents::new(cents),
                description: "mensuel".to_owned(),
            },
            schedule: RuleSchedule {
                frequency: Frequency::Monthly,
                interval: 1,
                start_date: IsoDate::parse("2026-03-01").unwrap(),
                end_date: end_date.map(|d| IsoDate::parse(d).unwrap()),
            },
        }
    }

    fn date(value: &str) -> IsoDate {
        IsoDate::parse(value).unwrap()
    }

    #[test]
    fn create_round_trips_every_field() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);

        let created = repo
            .create(account_id, &details("Loyer", -75_000, Some("2026-12-01")))
            .unwrap();

        assert_eq!(repo.find(created.id).unwrap().unwrap(), created);
        assert_eq!(created.account_id, account_id);
        assert_eq!(created.template.label, "Loyer");
        assert_eq!(created.template.amount.kind, EntryKind::Debit);
        assert_eq!(created.template.amount.amount, 75_000);
        assert_eq!(created.template.description, "mensuel");
        assert_eq!(created.schedule.frequency, Frequency::Monthly);
        assert_eq!(created.schedule.interval, 1);
        assert_eq!(created.schedule.start_date.as_str(), "2026-03-01");
        assert_eq!(
            created.schedule.end_date.as_ref().map(IsoDate::as_str),
            Some("2026-12-01")
        );
    }

    #[test]
    fn create_round_trips_an_absent_end_date_and_category() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);

        let created = repo
            .create(account_id, &details("Loyer", -75_000, None))
            .unwrap();

        assert_eq!(created.schedule.end_date, None);
        assert_eq!(created.template.category_id, None);
    }

    #[test]
    fn create_round_trips_a_category() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);

        let created = repo
            .create(
                account_id,
                &RecurringRuleDetails {
                    template: RuleTemplate {
                        category_id: Some(2),
                        ..details("Loyer", -75_000, None).template
                    },
                    ..details("Loyer", -75_000, None)
                },
            )
            .unwrap();

        assert_eq!(created.template.category_id, Some(2));
    }

    #[test]
    fn create_against_an_unknown_category_is_reported() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);

        let err = repo
            .create(
                account_id,
                &RecurringRuleDetails {
                    template: RuleTemplate {
                        category_id: Some(404),
                        ..details("Loyer", -75_000, None).template
                    },
                    ..details("Loyer", -75_000, None)
                },
            )
            .unwrap_err();

        assert_eq!(err, RecurringError::UnknownCategory);
    }

    #[test]
    fn list_by_account_returns_only_that_accounts_rules() {
        let (conn, account_id) = fixture();
        let other = SqliteAccountRepository::new(conn.clone())
            .create(&AccountDetails {
                name: "Livret".to_owned(),
                color: "#10b981".to_owned(),
                icon: "piggy".to_owned(),
                created_date: date("2026-01-01"),
                opening_balance: 0,
            })
            .unwrap();
        let repo = SqliteRecurringRuleRepository::new(conn);
        repo.create(account_id, &details("Loyer", -75_000, None))
            .unwrap();
        repo.create(other.id, &details("Épargne", -10_000, None))
            .unwrap();

        let rules = repo.list_by_account(account_id).unwrap();

        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].template.label, "Loyer");
    }

    #[test]
    fn find_returns_none_for_an_unknown_id() {
        let (conn, _) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);

        assert!(repo.find(404).unwrap().is_none());
    }

    #[test]
    fn update_rewrites_every_field() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);
        let created = repo
            .create(account_id, &details("Loyer", -75_000, None))
            .unwrap();

        let updated = repo
            .update(
                created.id,
                &RecurringRuleDetails {
                    template: RuleTemplate {
                        label: "Loyer révisé".to_owned(),
                        category_id: Some(2),
                        amount: SignedCents::new(-80_000),
                        description: String::new(),
                    },
                    schedule: RuleSchedule {
                        frequency: Frequency::Weekly,
                        interval: 3,
                        start_date: date("2026-04-01"),
                        end_date: Some(date("2027-04-01")),
                    },
                },
            )
            .unwrap();

        assert_eq!(repo.find(created.id).unwrap().unwrap(), updated);
        assert_eq!(updated.template.label, "Loyer révisé");
        assert_eq!(updated.template.amount.to_cents(), -80_000);
        assert_eq!(updated.schedule.frequency, Frequency::Weekly);
        assert_eq!(updated.schedule.interval, 3);
    }

    #[test]
    fn update_of_an_unknown_rule_reports_it_as_missing() {
        let (conn, _) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);

        let err = repo
            .update(404, &details("Loyer", -75_000, None))
            .unwrap_err();

        assert_eq!(err, RecurringError::NotFound);
    }

    #[test]
    fn delete_removes_the_rule() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);
        let created = repo
            .create(account_id, &details("Loyer", -75_000, None))
            .unwrap();

        repo.delete(created.id).unwrap();

        assert!(repo.find(created.id).unwrap().is_none());
    }

    #[test]
    fn delete_of_an_unknown_rule_reports_it_as_missing() {
        let (conn, _) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);

        assert_eq!(repo.delete(404).unwrap_err(), RecurringError::NotFound);
    }

    #[test]
    fn deleting_an_account_cascades_its_rules_away() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn.clone());
        repo.create(account_id, &details("Loyer", -75_000, None))
            .unwrap();

        SqliteAccountRepository::new(conn)
            .delete(account_id)
            .unwrap();

        assert!(repo.list_by_account(account_id).unwrap().is_empty());
    }

    fn occurrence_override(rule_id: i64, date_value: &str, cents: i64) -> OccurrenceOverride {
        OccurrenceOverride {
            rule_id,
            occurrence_date: date(date_value),
            template: RuleTemplate {
                label: "Loyer".to_owned(),
                category_id: None,
                amount: SignedCents::new(cents),
                description: String::new(),
            },
        }
    }

    #[test]
    fn an_override_round_trips() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);
        let rule = repo
            .create(account_id, &details("Loyer", -75_000, None))
            .unwrap();

        repo.save_override(&occurrence_override(rule.id, "2026-04-01", -80_000))
            .unwrap();

        let stored = repo.list_overrides(rule.id).unwrap();
        assert_eq!(
            stored,
            vec![occurrence_override(rule.id, "2026-04-01", -80_000)]
        );
    }

    #[test]
    fn saving_a_second_override_for_the_same_occurrence_replaces_the_first() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);
        let rule = repo
            .create(account_id, &details("Loyer", -75_000, None))
            .unwrap();

        repo.save_override(&occurrence_override(rule.id, "2026-04-01", -80_000))
            .unwrap();
        repo.save_override(&occurrence_override(rule.id, "2026-04-01", -82_000))
            .unwrap();

        let stored = repo.list_overrides(rule.id).unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].template.amount.to_cents(), -82_000);
    }

    #[test]
    fn deleting_one_override_leaves_the_rules_others() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);
        let rule = repo
            .create(account_id, &details("Loyer", -75_000, None))
            .unwrap();
        repo.save_override(&occurrence_override(rule.id, "2026-04-01", -80_000))
            .unwrap();
        repo.save_override(&occurrence_override(rule.id, "2026-05-01", -81_000))
            .unwrap();

        repo.delete_override(rule.id, &date("2026-04-01")).unwrap();

        let stored = repo.list_overrides(rule.id).unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].occurrence_date.as_str(), "2026-05-01");
    }

    #[test]
    fn delete_overrides_discards_all_of_the_rules_outstanding_ones() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);
        let rule = repo
            .create(account_id, &details("Loyer", -75_000, None))
            .unwrap();
        repo.save_override(&occurrence_override(rule.id, "2026-04-01", -80_000))
            .unwrap();
        repo.save_override(&occurrence_override(rule.id, "2026-05-01", -81_000))
            .unwrap();

        repo.delete_overrides(rule.id).unwrap();

        assert!(repo.list_overrides(rule.id).unwrap().is_empty());
    }

    #[test]
    fn deleting_a_rule_cascades_its_overrides_and_keeps_the_entries_it_generated() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn.clone());
        let rule = repo
            .create(account_id, &details("Loyer", -75_000, None))
            .unwrap();
        repo.save_override(&occurrence_override(rule.id, "2026-04-01", -80_000))
            .unwrap();
        repo.insert_occurrence_if_absent(
            rule.id,
            account_id,
            &date("2026-03-01"),
            &details("Loyer", -75_000, None).template,
        )
        .unwrap();

        repo.delete(rule.id).unwrap();

        assert!(repo.list_overrides(rule.id).unwrap().is_empty());

        let conn = conn.lock().unwrap();
        let (count, still_linked): (i64, i64) = conn
            .query_row(
                "SELECT COUNT(*), COUNT(recurring_rule_id) FROM entries \
                 WHERE account_id = ?1 AND is_system = 0",
                [account_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(count, 1, "the generated entry should survive its rule");
        assert_eq!(still_linked, 0, "its provenance link should be severed");
    }

    #[test]
    fn an_occurrence_is_written_as_an_ordinary_unreconciled_entry() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn.clone());
        let rule = repo
            .create(account_id, &details("Loyer", -75_000, None))
            .unwrap();

        let written = repo
            .insert_occurrence_if_absent(rule.id, account_id, &date("2026-03-01"), &rule.template)
            .unwrap();

        assert!(written);
        let conn = conn.lock().unwrap();
        let (label, kind, amount, is_system, reconciled): (String, String, i64, i64, i64) = conn
            .query_row(
                "SELECT label, type, amount, is_system, reconciled FROM entries \
                 WHERE recurring_rule_id = ?1",
                [rule.id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(label, "Loyer");
        assert_eq!(kind, "DEBIT");
        assert_eq!(amount, 75_000);
        assert_eq!(is_system, 0);
        assert_eq!(reconciled, 0);
    }

    #[test]
    fn a_second_insert_of_the_same_occurrence_is_reported_as_already_present() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn.clone());
        let rule = repo
            .create(account_id, &details("Loyer", -75_000, None))
            .unwrap();

        assert!(repo
            .insert_occurrence_if_absent(rule.id, account_id, &date("2026-03-01"), &rule.template)
            .unwrap());
        assert!(
            !repo
                .insert_occurrence_if_absent(
                    rule.id,
                    account_id,
                    &date("2026-03-01"),
                    &rule.template
                )
                .unwrap(),
            "a repeated occurrence must be a no-op, not an error and not a duplicate"
        );

        let count: i64 = conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM entries WHERE recurring_rule_id = ?1",
                [rule.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    /// The reason the duplicate check matches one specific conflict instead
    /// of `INSERT OR IGNORE`: any other failure has to surface, or the
    /// generator would read it as "already generated" and silently skip an
    /// entry the user is owed.
    #[test]
    fn an_occurrence_write_that_fails_for_another_reason_is_not_reported_as_already_present() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);
        let rule = repo
            .create(account_id, &details("Loyer", -75_000, None))
            .unwrap();

        let err = repo
            .insert_occurrence_if_absent(
                rule.id,
                account_id,
                &date("2026-03-01"),
                &RuleTemplate {
                    category_id: Some(404),
                    ..rule.template.clone()
                },
            )
            .unwrap_err();

        assert_eq!(err, RecurringError::UnknownCategory);
    }

    #[test]
    fn last_generated_date_is_the_most_recent_occurrence_written() {
        let (conn, account_id) = fixture();
        let repo = SqliteRecurringRuleRepository::new(conn);
        let rule = repo
            .create(account_id, &details("Loyer", -75_000, None))
            .unwrap();
        assert_eq!(repo.last_generated_date(rule.id).unwrap(), None);

        for day in ["2026-03-01", "2026-05-01", "2026-04-01"] {
            repo.insert_occurrence_if_absent(rule.id, account_id, &date(day), &rule.template)
                .unwrap();
        }

        assert_eq!(
            repo.last_generated_date(rule.id).unwrap(),
            Some(date("2026-05-01"))
        );
    }
}
