# 04 — Category quick-create from the entry row

**What to build:** The user can create a brand-new category from inside the entry row's category dropdown, without leaving the entries screen, and have it selected immediately.

Scope, per `docs/spec/06-entries.md`:

- The entry row's category field (already a dropdown/combobox as of ticket 03, listing categories with color/icon swatch and name from `CategoriesApi.listCategories()`) gains a "Nouvelle catégorie" affordance.
- That affordance opens the existing `CategoryModal` component (`src/app/features/settings/categories/category-modal`), reused as-is — no new backend command.
- On save, the newly created category is selected on the entry row immediately, with no manual re-open of the dropdown required.

Out of scope: any change to `CategoryModal` itself or to `CategoriesApi` (both already exist from `04-categories.md`), the reconciliation panel (`08-reconciliation.md`).

**Blocked by:** `entries` ticket 03 — Entry create/edit/delete & reconciliation toggle

**Status:** ready-for-agent

- [ ] The entry row's category dropdown has a "Nouvelle catégorie" affordance opening `CategoryModal`
- [ ] Saving the modal creates the category via the existing category use case and selects it on the entry row immediately, without a manual dropdown re-open
- [ ] Component tests (Vitest) with mocked `EntriesApi`/`CategoriesApi`: the quick-create affordance opens `CategoryModal`, and saving it selects the result on the entry row
