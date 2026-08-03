# Business Requirements — Personal Banking Application

## 1. Overview

Desktop application for managing personal bank accounts (a "cash book" / account register), allowing the user to track several independent accounts, their entries, and to reconcile against bank statements.

- **Application type**: desktop, single-user, data stored locally
- **Stack**: Tauri (Rust) + Angular
- **Storage**: SQLite, file location configurable in settings
- **Architecture**: Clean Architecture / light DDD, business logic 100% on the Rust side
- **Visual style**: rounded, modern design, Slack / current-SaaS style, light and dark mode
- **Target platforms**: Windows for v1 (macOS and Linux considered for a future evolution)

---

## 2. Technical architecture

> In-depth technical details (crate/library choices, testing strategy, CI/CD): see [technical-architecture.md](../architecture/technical-architecture.md) (kept in French, the language of the original architecture review).

### 2.1 Split of responsibilities

- **Rust (Tauri backend)**: owns all business logic, validation rules, calculations (balances, reconciliation, generation of recurring entries), and data access (SQLite).
- **Angular (frontend)**: pure presentation layer. No business rule and no direct SQLite access. All interactions go through Tauri commands (`invoke`).

### 2.2 Clean Architecture organization (Rust side)

- **Domain**: business entities (`Account`, `Category`, `Entry`, `RecurringRule`...) and invariant rules.
- **Use cases**: orchestrate business rules (create an account, generate due recurring entries, compute the reconciled balance, etc.).
- **Repositories**: interfaces defined in the domain, SQLite implementations in the infrastructure layer.
- **Tauri commands**: entry point exposed to Angular, calls the use cases.

### 2.3 Storage

- **Engine**: SQLite (via `tauri-plugin-sql` and/or `rusqlite` depending on integration needs with the Clean Architecture repositories).
- **Single file**, movable, location configurable in settings.
- **Currency**: a single global currency for the whole application (global setting, no multi-currency or exchange-rate handling).
- **Display format** for dates and amounts configurable in settings (independent from the currency itself).

### 2.4 Performance

- Pagination of entries on the Rust side (batched queries).
- Virtual scroll on the Angular side (Angular CDK Virtual Scroll) for displaying long entry lists.

### 2.5 Tests

Full coverage:

- **Unit tests** on the Rust domain and use cases (business rules, balance calculations, recurrence generation).
- **Integration tests** on SQLite repositories.
- **Angular component tests**.
- **End-to-end tests** via Tauri driver.

### 2.6 Security

Out of scope for v1: no application-level lock (password/PIN), no data file encryption. Protection is the responsibility of workstation security.

### 2.7 Import / export

Out of scope for v1. Data portability relies solely on the SQLite file itself (copyable/movable via the location setting).

---

## 3. Data model (domain)

### 3.1 Account

| Field            | Type              | Notes                                    |
| ---------------- | ----------------- | ---------------------------------------- |
| id               | unique identifier |                                          |
| name             | text              |                                          |
| color            | color             | displayed on cards and throughout the UI |
| created_date     | date              |                                          |
| opening_balance  | amount            | generates a system entry at creation     |
| archived         | boolean           | true if the account is archived          |
| last_viewed_date | date              | used for generating recurring entries    |

**Rules**:

- Deleting an account is forbidden if it contains entries; archiving is possible instead (hidden from active lists, history preserved).
- The opening balance generates a **system entry** in the register, visible but editable **only** from the account screen (not from the regular entry screen). Its default date is the account's creation date, but it remains editable.
- Clicking an account goes directly to its entries screen.

### 3.2 Category

| Field       | Type                   | Notes       |
| ----------- | ---------------------- | ----------- |
| id          | unique identifier      |             |
| name        | text                   |             |
| color       | color                  |             |
| icon        | icon library reference | e.g. Lucide |
| description | text                   |             |

**Rules**:

- **Global** list across the whole application (shared between all accounts).
- **Flat** list in v1 (no parent/child hierarchy), but the data model must stay open to a future evolution toward a two-level hierarchy.
- The same category can be used indifferently for debit or credit (no expense/income distinction at the category level).
- Update / creation always possible. Deletion only if no entry is associated.
- A list of preconfigured categories is proposed at install time (see section 6).

### 3.3 Entry

| Field             | Type                 | Notes                                              |
| ----------------- | -------------------- | -------------------------------------------------- |
| id                | unique identifier    |                                                    |
| account_id        | reference            |                                                    |
| label             | text                 |                                                    |
| category_id       | reference            |                                                    |
| date              | date                 |                                                    |
| type              | debit / credit       |                                                    |
| amount            | positive amount      |                                                    |
| reconciled        | boolean              | reconciliation checkmark                           |
| description       | text                 |                                                    |
| is_system         | boolean              | true for the opening-balance line                  |
| recurring_rule_id | reference (nullable) | set if the entry was generated by a recurring rule |

**Rules**:

- Amount entry: two-way sync between the amount's sign and the debit/credit selector — typing a negative amount automatically flips the selector, and vice versa, while remaining directly editable from either side.
- A system entry (opening balance) is not directly deletable, and its category/amount are only editable from the account screen.
- Deleting a normal entry: permanent, with a simple confirmation (no trash/soft-delete in v1).
- An entry generated from a recurring rule becomes, once created, an **independent** entry: it is editable/deletable like any normal entry, with no impact on the rule or on other occurrences.
- Default display order: most recent to oldest (reversible).

### 3.4 Recurring rule (recurring entry)

| Field                                         | Type                      | Notes                                               |
| --------------------------------------------- | ------------------------- | --------------------------------------------------- |
| id                                            | unique identifier         |                                                     |
| account_id                                    | reference                 | managed per account                                 |
| label, category_id, type, amount, description | —                         | same fields as a standard entry, used as a template |
| frequency                                     | weekly / monthly / yearly |                                                     |
| interval                                      | integer                   | e.g. every 2 months                                 |
| start_date                                    | date                      |                                                     |
| end_date                                      | date (nullable)           | optional                                            |

**Rules**:

- When an account is opened, all occurrences due between the last-viewed date and today (inclusive) are automatically generated as independent entries.
- Generation is also triggered **on application startup**, for all accounts (not just the one being opened), so that the balances shown on the home screen are always up to date.
- Changing a rule's configuration (amount, frequency, end date...) offers a scope choice: apply only to the next occurrence, or to the next and all future occurrences. Already-generated occurrences are never impacted retroactively.

### 3.5 Reconciliation

Computed per account, no dedicated stored entity beyond the `reconciled` field on each entry, plus two settings values per account:

| Field          | Type   | Notes                        |
| -------------- | ------ | ---------------------------- |
| bank_balance   | amount | entered manually by the user |
| statement_date | date   | editable                     |

**Calculation**:

- `reconciled_balance` = sum of the account's entries where `reconciled = true` **and** `date ≤ statement_date`.
- `delta` = `bank_balance` − `reconciled_balance`.
- Displayed "green" if `delta = 0` (balances reconciled), "red" otherwise.

---

## 4. Screens

### 4.1 Home screen

- List of active (non-archived) accounts as cards.
- Each card displays: name, color, current balance, red/green reconciliation status indicator.
- No aggregated total balance across all accounts.
- Clicking a card → the account's entries screen.

### 4.2 Account / entries screen

- List of the account's entries (paginated, virtual scroll), sorted by default from most recent to oldest.
- "Reconciliation" area: reconciled balance, bank balance (editable), statement date (editable), delta, red/green indicator.
- Entry creation/edit form: label, category (with a quick-create shortcut on the fly), date, debit/credit selector synced with the amount, reconciliation checkbox, description, amount.
- Utility features:
  - Filter entries by date range / jump to a specific date
  - Reverse the display order
  - Quick-create shortcut for a category directly from the entry form
  - Filter to show only unreconciled entries
- Access to the account's recurring entries configuration.
- Opening balance editable from this screen (modifies the associated system line).

### 4.3 Category management screen

- Global list of categories (name, color, icon, description).
- Free creation / modification.
- Deletion only possible if no entry is associated with the category.
- Icon picker: search within a predefined library (e.g. Lucide).

### 4.4 Statistics screen (advanced / not urgent)

- Scope: always per individual account (no consolidated cross-account view).
- Over a selectable time range:
  - Breakdown of entries by category
  - Total income / expense amount per month

### 4.5 Settings screen

- Data file location (editable)
- Date display format
- Currency display format
- Theme (light / dark / system)

---

## 5. UI / UX

- **Application language: French.** All on-screen labels, field names, button text, and messages are in French, using the domain terms from these business requirements (Compte, Poste, Écriture, Pointage...). Only the source code (identifiers, comments, table names) is in English — see the [technical architecture doc](../architecture/technical-architecture.md) §4 for the FR (UI) → EN (code) glossary.
- Rounded, clean design, Slack / modern-SaaS spirit.
- Accent colors used to differentiate accounts and categories (color chosen at creation).
- **Light and dark mode**, with system preference detection on first launch and manual toggle in settings.
- Category icons from a predefined library (e.g. Lucide) via a picker with keyword search — no custom image upload in v1.

---

## 6. Proposed preconfigured categories (starting list)

About a dozen common categories, freely adjustable in the application after installation:

| Category              | Icon (suggestion) | Color (suggestion)      |
| --------------------- | ----------------- | ----------------------- |
| Groceries             | shopping-cart     | #4ADE80 (green)         |
| Housing               | home              | #60A5FA (blue)          |
| Transport             | car               | #FB923C (orange)        |
| Restaurants / Outings | utensils          | #F472B6 (pink)          |
| Leisure               | party-popper      | #A78BFA (purple)        |
| Health                | heart-pulse       | #F87171 (red)           |
| Shopping / Clothing   | shirt             | #FBBF24 (yellow)        |
| Subscriptions         | repeat            | #38BDF8 (light blue)    |
| Salary                | banknote          | #34D399 (emerald green) |
| Savings / Investment  | piggy-bank        | #818CF8 (indigo)        |
| Taxes                 | landmark          | #94A3B8 (blue-gray)     |
| Miscellaneous         | more-horizontal   | #A8A29E (gray)          |

---

## 7. v1 scope vs future evolutions

### Included in v1

- Multi-account management, independent accounts (no native transfer)
- Global categories (flat list)
- Entries with reconciliation
- Recurring entries (weekly/monthly/yearly)
- Filters and shortcuts on the entry screen
- Light/dark theme
- Pagination / virtual scroll
- Unit, integration, component, and e2e tests

### Explicitly out of scope for v1 (possible evolutions)

- macOS and Linux support (v1: Windows only)
- Native transfers between accounts (automatically linked entries)
- Category hierarchy (sub-categories)
- Data import / export (CSV, OFX...)
- Application lock / encryption
- Consolidated multi-account statistics view
- Custom icon upload for categories

---

## 8. Open decisions / not yet addressed

_(to be completed if additional points emerge during development)_
