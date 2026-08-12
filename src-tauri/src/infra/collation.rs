//! A case- and accent-insensitive SQLite collation for French names.
//!
//! SQLite's built-in `NOCASE` only folds ASCII, so a name with an accented
//! initial ("Épargne / Investissement") sorts after every unaccented one —
//! the wrong order for an app whose data is entirely French. `FRENCH_NOCASE`
//! folds case and accents before comparing, and `register` installs it on
//! every connection `infra::db` hands out, so any `ORDER BY name` can use it.
//!
//! Folding by hand rather than pulling in a Unicode collation crate: the
//! alphabet in play is French, where "sort é as e" is the whole rule.

use std::cmp::Ordering;

use rusqlite::Connection;

/// Name to reference in SQL, as in `ORDER BY name COLLATE FRENCH_NOCASE`.
pub const FRENCH_NOCASE: &str = "FRENCH_NOCASE";

pub fn register(conn: &Connection) -> rusqlite::Result<()> {
    conn.create_collation(FRENCH_NOCASE, compare)
}

/// Names that fold to the same key still get a deterministic order, from the
/// raw comparison — otherwise "Ecole" and "École" would swap places between
/// two reads of the same table.
fn compare(left: &str, right: &str) -> Ordering {
    fold(left).cmp(&fold(right)).then_with(|| left.cmp(right))
}

fn fold(value: &str) -> String {
    let mut folded = String::with_capacity(value.len());

    for c in value.chars().flat_map(char::to_lowercase) {
        match c {
            'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => folded.push('a'),
            'ç' => folded.push('c'),
            'è' | 'é' | 'ê' | 'ë' => folded.push('e'),
            'ì' | 'í' | 'î' | 'ï' => folded.push('i'),
            'ñ' => folded.push('n'),
            'ò' | 'ó' | 'ô' | 'õ' | 'ö' => folded.push('o'),
            'ù' | 'ú' | 'û' | 'ü' => folded.push('u'),
            'ý' | 'ÿ' => folded.push('y'),
            'æ' => folded.push_str("ae"),
            'œ' => folded.push_str("oe"),
            other => folded.push(other),
        }
    }

    folded
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sorted(names: &[&str]) -> Vec<String> {
        let conn = Connection::open_in_memory().unwrap();
        register(&conn).unwrap();
        conn.execute("CREATE TABLE t (name TEXT NOT NULL)", [])
            .unwrap();
        for name in names {
            conn.execute("INSERT INTO t (name) VALUES (?1)", [name])
                .unwrap();
        }

        let mut statement = conn
            .prepare(&format!(
                "SELECT name FROM t ORDER BY name COLLATE {FRENCH_NOCASE}"
            ))
            .unwrap();
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap()
    }

    #[test]
    fn an_accented_initial_sorts_where_its_base_letter_does() {
        assert_eq!(
            sorted(&["Transport", "Épargne", "Divers", "Impôts"]),
            ["Divers", "Épargne", "Impôts", "Transport"]
        );
    }

    #[test]
    fn case_is_folded_like_nocase_was() {
        assert_eq!(
            sorted(&["cadeaux b", "Anniversaires", "Cadeaux A"]),
            ["Anniversaires", "Cadeaux A", "cadeaux b"]
        );
    }

    #[test]
    fn an_accent_only_breaks_a_tie_it_never_decides_the_order() {
        assert_eq!(sorted(&["Écoles", "Ecole"]), ["Ecole", "Écoles"]);
        assert_eq!(sorted(&["École", "Ecole"]), ["Ecole", "École"]);
    }

    #[test]
    fn folding_covers_the_french_alphabet_and_its_ligatures() {
        assert_eq!(fold("Àâäçèéêëîïôöùûüÿ"), "aaaceeeeiioouuuy");
        assert_eq!(fold("CŒUR & Bœuf"), "coeur & boeuf");
    }
}
