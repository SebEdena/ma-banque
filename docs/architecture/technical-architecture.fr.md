# Architecture technique détaillée — Ma Banque

Complément au [cahier des charges](../spec/00-business-requirements.md) (désormais rédigé en anglais — voir aussi la [version française originale](../spec/00-business-requirements.fr.md)), qui reste la référence fonctionnelle. Ce document détaille les choix techniques (stack, tests, CI/CD) issus d'une session de revue de l'architecture.

**Convention transverse** : le code source (identifiants, commentaires, noms de tables) est intégralement **en anglais**, même si ce document et le cahier des charges sont en français. Voir le glossaire de traduction en fin de document.

---

## 1. Rust (backend Tauri)

### 1.1 Organisation du code

Un seul crate Rust (pas de workspace multi-crates), organisé en modules reflétant la Clean Architecture :

- `domain/` — entités métier et règles invariantes
- `usecases/` — orchestration des règles métier
- `infra/` — implémentations concrètes (SQLite)
- `commands/` — points d'entrée Tauri, appellent les use cases

Un workspace multi-crates apporterait une frontière de compilation plus stricte, mais ajoute une friction (temps de build, imports croisés) disproportionnée pour une v1 mono-utilisateur de cette taille. Les modules + revue de code suffisent à faire respecter les frontières.

### 1.2 Gestion des erreurs

- **`thiserror`** pour les erreurs métier (domaine/use cases) : enums explicites (ex: `AccountError::HasEntries`), sérialisées via `serde::Serialize` pour remonter proprement à Angular et permettre un affichage différencié selon le cas.
- **`anyhow`** pour les erreurs techniques en couche infrastructure (I/O, SQLite), converties en erreur générique au niveau de la commande Tauri.

### 1.3 Accès aux données

- **`rusqlite`** (synchrone), pas `sqlx` (async) ni `tauri-plugin-sql` (ce dernier est conçu pour être piloté depuis le JS, ce qui casserait la règle "aucun accès direct à SQLite depuis Angular").
- Pas de runtime async : l'app est mono-utilisateur, sans charge concurrente justifiant `tokio`. Tauri exécute déjà chaque commande sur un pool de threads.
- **Migrations** : `rusqlite_migration`, fichiers `.sql` versionnés embarqués via `include_str!`.
- **Concurrence** : la connexion est partagée via **`Arc<Mutex<Connection>>`** dans l'état géré par Tauri (`tauri::State`) — pas de pool `r2d2`. SQLite n'autorise qu'un seul writer à la fois ; un pool n'apporterait aucune valeur ici.

### 1.4 Repositories

- Définis comme **traits** dans le domaine (ex: `trait AccountRepository`), implémentations concrètes SQLite dans `infra/`.
- Chaque implémentation concrète possède un `Arc<Mutex<Connection>>` (cloné depuis l'état Tauri), et verrouille en interne à chaque appel de méthode. Ceci évite tout paramètre de lifetime explicite sur les traits ou les use cases — un piège classique en Rust pour ce genre d'architecture.
- Les use cases prennent `&dyn AccountRepository` (ou un générique borné), sans jamais connaître l'existence de la connexion SQLite.

### 1.5 Tests

| Niveau              | Approche                                                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use cases           | **Fakes en mémoire** écrits à la main (implémentations des traits repository sur `Vec`/`HashMap`), pas `mockall` — plus robustes au refactor, plus lisibles pour un dev découvrant Rust. |
| Repositories SQLite | Tests d'intégration contre une base **`:memory:`**, connexion + migrations neuves à chaque test (isolation totale, rapide).                                                              |
| Domaine             | Tests unitaires classiques (règles de calcul, validations).                                                                                                                              |

### 1.6 Données locales de dev

En build debug (`npm run tauri dev`, ainsi que le build `--debug` utilisé par
la suite e2e), le fichier pointeur du dossier de données et le dossier
`saves/` par défaut sont conservés sous `.dev-data/` à la racine du repo au
lieu des répertoires config/data standards de l'OS — les runs locaux et les
tests e2e ne touchent jamais (et ne sont jamais pollués par) un vrai profil
utilisateur. Supprimer `.dev-data/` réinitialise à un état de premier
lancement. Les builds release (`npm run tauri build`) ne sont pas concernés et
utilisent les vrais répertoires de l'OS.

---

## 2. Angular (frontend)

### 2.1 Composants UI / style

- **Angular 22** (stable depuis juin 2026, support actif jusqu'à décembre 2026 / LTS jusqu'à mai 2028) comme version cible du projet.
- **`spartan/ui`** (architecture Brain + Helm, sur base Angular CDK + Tailwind CSS) comme socle principal : couvre la majorité des besoins (modal, dropdown, date picker, select, toast) avec un point de départ stylé "arrondi/SaaS" personnalisable.
- **`@angular/aria`** (headless, stable depuis la v22) en complément pour tout pattern custom non couvert par spartan (ex: comportement de l'indicateur de pointage).
- Dark mode géré nativement via Tailwind (`dark:`), cohérent avec le besoin clair/sombre/système.
- **Détection de changement zoneless par défaut** (pas de dépendance `zone.js`), composants en `OnPush` — comportement par défaut de `ng new` en v22, pas un choix opt-in du projet.

### 2.2 Tests

- **Vitest** pour les tests unitaires et de composants (runner par défaut scaffoldé par `ng new` depuis Angular 22, Karma/Jasmine totalement retirés).
- **E2E** : WebdriverIO + `@wdio/tauri-service` (pilote `tauri-driver`), exécutés sur `windows-latest` uniquement (voir §3).
- **Chaque spec qui ajoute un nouveau flux métier orienté utilisateur (écrans de type création/édition/suppression, pas seulement une nouvelle route) étend la suite e2e** avec un scénario couvrant les hooks `data-testid` de ce flux — le smoke test du shell prouve que l'app se lance, pas qu'une fonctionnalité marche de bout en bout. La section « Testing Decisions » d'une spec ne peut s'en dispenser que si la spec n'ajoute aucun nouveau flux utilisateur (ex. changement de schéma ou d'infra uniquement). Chaque nouveau fichier de spec a son propre `e2e/*.e2e.ts`, partageant une session WDIO via le regroupement de specs de `wdio.conf.ts` — voir `ensureRoutedShell()` dans `e2e/support/routed-shell.ts` pour la façon dont un fichier reprend là où un fichier précédent de la session s'est arrêté, plutôt que de supposer un lancement à froid.

### 2.3 Style de code

- `angular-eslint` + `Prettier`.
- Hook pre-commit (Husky + lint-staged) pour formater/lint automatiquement les fichiers modifiés avant chaque commit.

---

## 3. CI/CD

**Plateforme cible v1 : Windows uniquement** (macOS/Linux repoussés en évolution future — voir cahier des charges §1 et §7).

Hébergement : GitHub Actions (repo sur GitHub).

### 3.1 Sur chaque push / PR

Jobs bloquants pour merger sur `main` :

- Rust : `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` (unitaires + intégration)
- Angular : `eslint`, tests Vitest, `tsc --noEmit`
- Compilation : `cargo check` / `cargo build` sur `windows-latest` (pas de build d'installeur complet à ce stade)
- Cache Rust : `Swatinem/rust-cache`

Les tests e2e (WebdriverIO) sont exécutés à part — sur PR vers `main`, pas sur chaque push (plus lents, nécessitent l'app compilée).

### 3.2 Sur tag `vX.Y.Z`

Workflow dédié utilisant **`tauri-apps/tauri-action`** sur `windows-latest` :

- Build + bundling de l'installeur (`.msi`/`.exe`)
- Création d'une GitHub Release (brouillon) avec l'installeur en asset
- Pas de signing/notarisation en v1 (app perso non distribuée en masse — avertissement "éditeur non reconnu" acceptable)
- Version source de vérité : `tauri.conf.json`, bumpée par le workflow `bump-version.yml` (déclenchement manuel, choix `patch`/`minor`/`major`), qui synchronise `Cargo.toml`/`Cargo.lock` et `package.json`/`package-lock.json`, régénère `CHANGELOG.md` à partir des commits conventionnels via `git-cliff` (config : `cliff.toml`), commit sur `main`, et pousse le tag `vX.Y.Z` qui déclenche ce workflow de release

---

## 4. Glossaire de traduction (FR → EN, code source)

| FR (cahier des charges) | EN (code)            |
| ----------------------- | -------------------- |
| Compte                  | `Account`            |
| Poste                   | `Category`           |
| Écriture                | `Entry`              |
| Règle de périodicité    | `RecurringRule`      |
| Pointage                | `Reconciliation`     |
| solde_pointe            | `reconciled_balance` |
| solde_banque            | `bank_balance`       |
| date_arret              | `statement_date`     |
| est_systeme             | `is_system`          |
