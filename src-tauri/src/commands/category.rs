//! Tauri commands exposing categories to Angular.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::domain::category::{CategoryError, DynCategoryRepository};
use crate::domain::entry::DynEntryRepository;
use crate::usecases::category::{self as usecases, CategoryInput, CategorySummary};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CategoryView {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub description: String,
    /// How many entries use this category — the panel shows it on each card
    /// and uses it to decide between offering deletion and refusing it.
    pub usage_count: i64,
}

impl From<CategorySummary> for CategoryView {
    fn from(summary: CategorySummary) -> Self {
        let CategorySummary {
            category,
            usage_count,
        } = summary;

        Self {
            id: category.id,
            name: category.name,
            color: category.color,
            icon: category.icon,
            description: category.description,
            usage_count,
        }
    }
}

/// The create/edit modal's form, as it comes off the wire.
#[derive(Debug, Clone, Deserialize)]
pub struct CategoryInputPayload {
    pub name: String,
    pub color: String,
    pub icon: String,
    pub description: String,
}

impl From<CategoryInputPayload> for CategoryInput {
    fn from(payload: CategoryInputPayload) -> Self {
        CategoryInput {
            name: payload.name,
            color: payload.color,
            icon: payload.icon,
            description: payload.description,
        }
    }
}

#[tauri::command]
pub fn list_categories(
    categories: State<DynCategoryRepository>,
    entries: State<DynEntryRepository>,
) -> Result<Vec<CategoryView>, CategoryError> {
    Ok(usecases::list_categories(&**categories, &**entries)?
        .into_iter()
        .map(CategoryView::from)
        .collect())
}

#[tauri::command]
pub fn create_category(
    categories: State<DynCategoryRepository>,
    entries: State<DynEntryRepository>,
    input: CategoryInputPayload,
) -> Result<CategoryView, CategoryError> {
    usecases::create_category(&**categories, &**entries, input.into()).map(CategoryView::from)
}

#[tauri::command]
pub fn update_category(
    categories: State<DynCategoryRepository>,
    entries: State<DynEntryRepository>,
    id: i64,
    input: CategoryInputPayload,
) -> Result<CategoryView, CategoryError> {
    usecases::update_category(&**categories, &**entries, id, input.into()).map(CategoryView::from)
}

#[tauri::command]
pub fn delete_category(
    categories: State<DynCategoryRepository>,
    entries: State<DynEntryRepository>,
    id: i64,
) -> Result<(), CategoryError> {
    usecases::delete_category(&**categories, &**entries, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::category::Category;

    fn summary(usage_count: i64) -> CategorySummary {
        CategorySummary {
            category: Category {
                id: 1,
                name: "Alimentation".to_owned(),
                color: "#4ADE80".to_owned(),
                icon: "shopping-cart".to_owned(),
                description: "Courses, supermarché, marché".to_owned(),
            },
            usage_count,
        }
    }

    #[test]
    fn a_category_crosses_the_boundary_with_its_usage_count() {
        let view = CategoryView::from(summary(7));

        assert_eq!(view.id, 1);
        assert_eq!(view.name, "Alimentation");
        assert_eq!(view.color, "#4ADE80");
        assert_eq!(view.icon, "shopping-cart");
        assert_eq!(view.description, "Courses, supermarché, marché");
        assert_eq!(view.usage_count, 7);
    }

    #[test]
    fn the_in_use_error_serializes_as_a_kind_angular_can_branch_on() {
        let json = serde_json::to_value(CategoryError::InUse).unwrap();

        assert_eq!(json, serde_json::json!({ "kind": "InUse" }));
    }
}
