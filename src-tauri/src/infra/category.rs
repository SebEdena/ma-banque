//! SQLite-backed implementation of `CategoryRepository`, against the
//! `categories` table (see `migrations/0005_create_categories.sql`).

use rusqlite::{Connection, OptionalExtension, Row};

use crate::domain::category::{Category, CategoryDetails, CategoryError, CategoryRepository};
use crate::infra::collation::FRENCH_NOCASE;
use crate::infra::db::SharedConnection;

const COLUMNS: &str = "id, name, color, icon, description";

pub struct SqliteCategoryRepository {
    conn: SharedConnection,
}

impl SqliteCategoryRepository {
    pub fn new(conn: SharedConnection) -> Self {
        Self { conn }
    }
}

fn io_err<E: std::fmt::Display>(e: E) -> CategoryError {
    CategoryError::Io(e.to_string())
}

fn to_category(row: &Row<'_>) -> rusqlite::Result<Category> {
    Ok(Category {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        icon: row.get(3)?,
        description: row.get(4)?,
    })
}

fn find_in(conn: &Connection, id: i64) -> Result<Option<Category>, CategoryError> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM categories WHERE id = ?1"),
        [id],
        to_category,
    )
    .optional()
    .map_err(io_err)
}

impl CategoryRepository for SqliteCategoryRepository {
    fn create(&self, details: &CategoryDetails) -> Result<Category, CategoryError> {
        let conn = self.conn.lock().unwrap();

        conn.execute(
            "INSERT INTO categories (name, color, icon, description) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                details.name,
                details.color,
                details.icon,
                details.description,
            ],
        )
        .map_err(io_err)?;

        find_in(&conn, conn.last_insert_rowid())?.ok_or(CategoryError::NotFound)
    }

    fn update(&self, id: i64, details: &CategoryDetails) -> Result<Category, CategoryError> {
        let conn = self.conn.lock().unwrap();

        let changed = conn
            .execute(
                "UPDATE categories SET name = ?1, color = ?2, icon = ?3, description = ?4 \
                 WHERE id = ?5",
                rusqlite::params![
                    details.name,
                    details.color,
                    details.icon,
                    details.description,
                    id,
                ],
            )
            .map_err(io_err)?;
        if changed == 0 {
            return Err(CategoryError::NotFound);
        }

        find_in(&conn, id)?.ok_or(CategoryError::NotFound)
    }

    fn delete(&self, id: i64) -> Result<(), CategoryError> {
        let changed = self
            .conn
            .lock()
            .unwrap()
            .execute("DELETE FROM categories WHERE id = ?1", [id])
            .map_err(io_err)?;

        if changed == 0 {
            return Err(CategoryError::NotFound);
        }

        Ok(())
    }

    fn find(&self, id: i64) -> Result<Option<Category>, CategoryError> {
        find_in(&self.conn.lock().unwrap(), id)
    }

    fn list(&self) -> Result<Vec<Category>, CategoryError> {
        let conn = self.conn.lock().unwrap();
        let mut statement = conn
            .prepare(&format!(
                "SELECT {COLUMNS} FROM categories ORDER BY name COLLATE {FRENCH_NOCASE}, id"
            ))
            .map_err(io_err)?;

        let categories = statement
            .query_map([], to_category)
            .map_err(io_err)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(io_err)?;

        Ok(categories)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::db;

    /// The starting list from business requirements §6, in the order the
    /// panel shows it — spelled out here rather than derived from the
    /// migration so the two have to agree.
    const SEEDED_NAMES: [&str; 12] = [
        "Abonnements",
        "Alimentation",
        "Divers",
        "Épargne / Investissement",
        "Impôts / Taxes",
        "Logement",
        "Loisirs",
        "Restaurant / Sorties",
        "Salaire",
        "Santé",
        "Shopping / Habillement",
        "Transport",
    ];

    fn details(name: &str) -> CategoryDetails {
        CategoryDetails {
            name: name.to_owned(),
            color: "#10b981".to_owned(),
            icon: "lucideShoppingCart".to_owned(),
            description: "Courses, supermarché, marché".to_owned(),
        }
    }

    fn repo() -> SqliteCategoryRepository {
        SqliteCategoryRepository::new(db::migrated_in_memory_connection())
    }

    fn names(repo: &SqliteCategoryRepository) -> Vec<String> {
        repo.list().unwrap().into_iter().map(|c| c.name).collect()
    }

    #[test]
    fn a_fresh_database_holds_exactly_the_twelve_preconfigured_categories() {
        assert_eq!(names(&repo()), SEEDED_NAMES);
    }

    #[test]
    fn every_seeded_category_carries_its_suggested_icon_and_color() {
        let repo = repo();

        let alimentation = repo
            .list()
            .unwrap()
            .into_iter()
            .find(|c| c.name == "Alimentation")
            .unwrap();

        assert_eq!(alimentation.icon, "lucideShoppingCart");
        assert_eq!(alimentation.color, "#10b981");
    }

    #[test]
    fn a_seeded_category_is_an_ordinary_row_that_can_be_edited_and_deleted() {
        let repo = repo();
        let seeded = repo.list().unwrap().into_iter().next().unwrap();

        repo.update(seeded.id, &details("Abos")).unwrap();
        assert_eq!(repo.find(seeded.id).unwrap().unwrap().name, "Abos");

        repo.delete(seeded.id).unwrap();
        assert_eq!(repo.find(seeded.id).unwrap(), None);
    }

    #[test]
    fn create_round_trips_every_field() {
        let repo = repo();

        let created = repo.create(&details("Cadeaux")).unwrap();

        let found = repo.find(created.id).unwrap().unwrap();
        assert_eq!(found, created);
        assert_eq!(found.name, "Cadeaux");
        assert_eq!(found.color, "#10b981");
        assert_eq!(found.icon, "lucideShoppingCart");
        assert_eq!(found.description, "Courses, supermarché, marché");
    }

    #[test]
    fn create_accepts_an_empty_description() {
        let repo = repo();

        let created = repo
            .create(&CategoryDetails {
                description: String::new(),
                ..details("Cadeaux")
            })
            .unwrap();

        assert_eq!(created.description, "");
    }

    #[test]
    fn update_rewrites_every_editable_field() {
        let repo = repo();
        let created = repo.create(&details("Cadeaux")).unwrap();

        let updated = repo
            .update(
                created.id,
                &CategoryDetails {
                    name: "Anniversaires".to_owned(),
                    color: "#F87171".to_owned(),
                    icon: "gift".to_owned(),
                    description: "Cadeaux et fêtes".to_owned(),
                },
            )
            .unwrap();

        assert_eq!(repo.find(created.id).unwrap().unwrap(), updated);
        assert_eq!(updated.name, "Anniversaires");
        assert_eq!(updated.color, "#F87171");
        assert_eq!(updated.icon, "gift");
        assert_eq!(updated.description, "Cadeaux et fêtes");
    }

    #[test]
    fn update_reports_an_unknown_category_as_missing() {
        assert_eq!(
            repo().update(404, &details("Cadeaux")).unwrap_err(),
            CategoryError::NotFound
        );
    }

    #[test]
    fn delete_removes_only_the_named_category() {
        let repo = repo();
        let created = repo.create(&details("Cadeaux")).unwrap();

        repo.delete(created.id).unwrap();

        assert_eq!(repo.find(created.id).unwrap(), None);
        assert_eq!(names(&repo), SEEDED_NAMES);
    }

    #[test]
    fn delete_reports_an_unknown_category_as_missing() {
        assert_eq!(repo().delete(404).unwrap_err(), CategoryError::NotFound);
    }

    #[test]
    fn find_returns_none_for_an_unknown_category() {
        assert_eq!(repo().find(404).unwrap(), None);
    }

    #[test]
    fn list_is_ordered_by_name_ignoring_case_and_accents() {
        let conn = db::migrated_in_memory_connection();
        conn.lock()
            .unwrap()
            .execute("DELETE FROM categories", [])
            .unwrap();
        let repo = SqliteCategoryRepository::new(conn);

        repo.create(&details("cadeaux b")).unwrap();
        repo.create(&details("Anniversaires")).unwrap();
        repo.create(&details("Éducation")).unwrap();
        repo.create(&details("Cadeaux A")).unwrap();

        assert_eq!(
            names(&repo),
            ["Anniversaires", "Cadeaux A", "cadeaux b", "Éducation"]
        );
    }

    #[test]
    fn every_seeded_category_carries_a_colour_of_its_own() {
        let mut colors: Vec<_> = repo()
            .list()
            .unwrap()
            .into_iter()
            .map(|c| c.color)
            .collect();
        colors.sort();
        colors.dedup();

        assert_eq!(colors.len(), SEEDED_NAMES.len());
    }
}
