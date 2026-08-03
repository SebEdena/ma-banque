# Cahier des charges — Application de Banque personnelle

## 1. Vue d'ensemble

Application desktop de gestion de comptes bancaires personnels (type "cash book" / registre de comptes), permettant de suivre plusieurs comptes indépendants, leurs écritures, et de faciliter le rapprochement bancaire.

- **Type d'application** : desktop, mono-utilisateur, données stockées en local
- **Stack** : Tauri (Rust) + Angular
- **Stockage** : SQLite, emplacement du fichier configurable dans les paramètres
- **Architecture** : Clean Architecture / DDD léger, logique métier 100% côté Rust
- **Style visuel** : design arrondi, moderne, façon Slack / SaaS actuel, mode clair et sombre
- **Plateformes cibles** : Windows pour la v1 (macOS et Linux envisagés en évolution future)

---

## 2. Architecture technique

> Détails techniques approfondis (choix de crates/librairies, stratégie de tests, CI/CD) : voir [Architecture_Technique.md](../architecture/Architecture_Technique.md).

### 2.1 Répartition des responsabilités

- **Rust (backend Tauri)** : porte l'intégralité de la logique métier, des règles de validation, des calculs (soldes, pointage, génération des écritures périodiques) et de l'accès aux données (SQLite).
- **Angular (frontend)** : pure couche de présentation. Aucune règle métier ni accès direct à SQLite. Toutes les interactions passent par des commandes Tauri (`invoke`).

### 2.2 Organisation en Clean Architecture (côté Rust)

- **Domaine** : entités métier (Compte, Poste, Écriture, RèglePériodicité...) et règles invariantes.
- **Cas d'usage (use cases)** : orchestrent les règles métier (créer un compte, générer les écritures périodiques dues, calculer le solde pointé, etc.).
- **Repositories** : interfaces définies dans le domaine, implémentations SQLite dans la couche infrastructure.
- **Commandes Tauri** : point d'entrée exposé à Angular, appelle les cas d'usage.

### 2.3 Stockage

- **Moteur** : SQLite (via `tauri-plugin-sql` et/ou `rusqlite` selon les besoins d'intégration avec les repositories Clean Architecture).
- **Fichier unique**, déplaçable, emplacement configurable dans les paramètres.
- **Devise** : une seule devise globale pour toute l'application (paramètre global, pas de gestion multi-devises ni de taux de change).
- **Format d'affichage** date et monétaire configurable dans les paramètres (indépendant de la devise elle-même).

### 2.4 Performance

- Pagination des écritures côté Rust (requêtes par lots).
- Scroll virtuel côté Angular (Angular CDK Virtual Scroll) pour l'affichage des longues listes d'écritures.

### 2.5 Tests

Couverture complète :

- **Tests unitaires** sur le domaine et les cas d'usage Rust (règles métier, calculs de solde, génération de périodicité).
- **Tests d'intégration** sur les repositories SQLite.
- **Tests de composants Angular**.
- **Tests end-to-end** via Tauri driver.

### 2.6 Sécurité

Hors scope pour la v1 : pas de verrouillage applicatif (mot de passe/PIN), pas de chiffrement du fichier de données. La protection relève de la sécurité du poste de travail.

### 2.7 Import / export

Hors scope pour la v1. La portabilité des données passe uniquement par le fichier SQLite lui-même (copiable/déplaçable via le réglage d'emplacement).

---

## 3. Modèle de données (domaine)

### 3.1 Compte

| Champ                      | Type               | Notes                                                 |
| -------------------------- | ------------------ | ----------------------------------------------------- |
| id                         | identifiant unique |                                                       |
| nom                        | texte              |                                                       |
| couleur                    | couleur            | affichée sur les cartes et dans l'UI                  |
| date_creation              | date               |                                                       |
| solde_depart               | montant            | génère une écriture système à la création             |
| archive                    | booléen            | true si le compte est archivé                         |
| date_derniere_consultation | date               | utilisée pour la génération des écritures périodiques |

**Règles** :

- La suppression d'un compte est interdite s'il contient des écritures ; possibilité d'archiver à la place (masqué des listes actives, historique conservé).
- Le solde de départ génère une **écriture système** dans le registre, visible mais modifiable **uniquement** via l'écran du compte (pas via l'écran d'écriture classique). Sa date par défaut est la date de création du compte, mais reste éditable.
- Cliquer sur un compte amène directement à l'écran de ses écritures.

### 3.2 Poste

| Champ       | Type                            | Notes      |
| ----------- | ------------------------------- | ---------- |
| id          | identifiant unique              |            |
| nom         | texte                           |            |
| couleur     | couleur                         |            |
| icone       | référence bibliothèque d'icônes | ex: Lucide |
| description | texte                           |            |

**Règles** :

- Liste **globale** à toute l'application (partagée entre tous les comptes).
- Liste **plate** en v1 (pas de hiérarchie parent/enfant), mais le modèle de données doit rester ouvert à une évolution future vers une hiérarchie à deux niveaux.
- Un même poste est utilisable indifféremment en débit ou en crédit (pas de distinction dépense/recette au niveau du poste).
- Mise à jour / ajout toujours possibles. Suppression uniquement si aucune écriture associée.
- Une liste de postes préconfigurés est proposée à l'installation (voir section 6).

### 3.3 Écriture

| Champ                | Type                 | Notes                                                           |
| -------------------- | -------------------- | --------------------------------------------------------------- |
| id                   | identifiant unique   |                                                                 |
| compte_id            | référence            |                                                                 |
| label                | texte                |                                                                 |
| poste_id             | référence            |                                                                 |
| date                 | date                 |                                                                 |
| type                 | débit / crédit       |                                                                 |
| montant              | montant positif      |                                                                 |
| pointee              | booléen              | coche de pointage                                               |
| description          | texte                |                                                                 |
| est_systeme          | booléen              | true pour la ligne de solde de départ                           |
| regle_periodicite_id | référence (nullable) | renseignée si l'écriture a été générée par une règle périodique |

**Règles** :

- Saisie du montant : synchronisation bidirectionnelle entre le signe du montant et le sélecteur débit/crédit — taper un montant négatif bascule automatiquement le sélecteur, et inversement, tout en restant modifiable directement des deux côtés.
- Une écriture système (solde de départ) n'est pas supprimable directement et son poste/montant ne sont modifiables que depuis l'écran du compte.
- Suppression d'une écriture normale : définitive, avec confirmation simple (pas de corbeille/soft-delete en v1).
- Une écriture générée à partir d'une règle périodique devient, une fois créée, une écriture **indépendante** : elle est modifiable/supprimable comme n'importe quelle écriture normale, sans impact sur la règle ni sur les autres occurrences.
- Ordre d'affichage par défaut : du plus récent au plus ancien (inversion possible).

### 3.4 Règle de périodicité (Écriture périodique)

| Champ                                       | Type                                | Notes                                                     |
| ------------------------------------------- | ----------------------------------- | --------------------------------------------------------- |
| id                                          | identifiant unique                  |                                                           |
| compte_id                                   | référence                           | gérée par compte                                          |
| label, poste_id, type, montant, description | —                                   | mêmes champs qu'une écriture standard, servant de gabarit |
| frequence                                   | hebdomadaire / mensuelle / annuelle |                                                           |
| intervalle                                  | entier                              | ex: tous les 2 mois                                       |
| date_debut                                  | date                                |                                                           |
| date_fin                                    | date (nullable)                     | optionnelle                                               |

**Règles** :

- À l'ouverture d'un compte, toutes les occurrences dues entre la date de dernière consultation et aujourd'hui (inclus) sont générées automatiquement sous forme d'écritures indépendantes.
- Génération également déclenchée **au démarrage de l'application**, pour tous les comptes (pas seulement celui qu'on ouvre), afin que les soldes affichés sur l'écran d'accueil soient toujours à jour.
- Modifier la configuration d'une règle (montant, fréquence, date de fin...) propose un choix de portée : appliquer uniquement à la prochaine occurrence, ou à la prochaine et à toutes les occurrences futures. Les occurrences déjà générées ne sont jamais impactées rétroactivement.

### 3.5 Pointage

Calculé par compte, pas d'entité dédiée stockée à part le champ `pointee` sur chaque écriture, plus deux valeurs de paramétrage par compte :

| Champ        | Type    | Notes                                |
| ------------ | ------- | ------------------------------------ |
| solde_banque | montant | saisi manuellement par l'utilisateur |
| date_arret   | date    | éditable                             |

**Calcul** :

- `solde_pointe` = somme des écritures du compte où `pointee = true` **et** `date ≤ date_arret`.
- `delta` = `solde_banque` − `solde_pointe`.
- Affichage "vert" si `delta = 0` (soldes rapprochés), "rouge" sinon.

---

## 4. Écrans

### 4.1 Écran d'accueil

- Liste des comptes actifs (non archivés) sous forme de cartes.
- Chaque carte affiche : nom, couleur, solde actuel, indicateur visuel rouge/vert de pointage.
- Pas de solde total agrégé tous comptes confondus.
- Clic sur une carte → écran des écritures du compte.

### 4.2 Écran du compte / écritures

- Liste des écritures du compte (paginée, scroll virtuel), triée par défaut du plus récent au plus ancien.
- Zone "Pointage" : solde pointé, solde banque (éditable), date d'arrêt (éditable), delta, indicateur rouge/vert.
- Formulaire de saisie/édition d'écriture : label, poste (avec raccourci de création rapide à la volée), date, sélecteur débit/crédit synchronisé avec le montant, coche de pointage, description, montant.
- Fonctionnalités utilitaires :
  - Filtrer les écritures par plage de dates / atteindre une date précise
  - Inverser l'ordre d'affichage
  - Raccourci de création rapide d'un poste directement depuis le formulaire d'écriture
  - Filtrer pour n'afficher que les écritures non pointées
- Accès à la configuration des écritures périodiques du compte.
- Solde de départ éditable depuis cet écran (modifie la ligne système associée).

### 4.3 Écran de gestion des postes

- Liste globale des postes (nom, couleur, icône, description).
- Création / modification libres.
- Suppression possible uniquement si aucune écriture associée au poste.
- Sélecteur d'icône : recherche dans une bibliothèque prédéfinie (type Lucide).

### 4.4 Écran de statistiques (avancé / non urgent)

- Portée : toujours par compte individuel (pas de vue consolidée tous comptes).
- Sur un intervalle de temps sélectionnable :
  - Répartition des écritures par poste
  - Montant total des recettes / dépenses par mois

### 4.5 Écran des paramètres

- Emplacement du fichier de données (modifiable)
- Format d'affichage des dates
- Format d'affichage monétaire
- Thème (clair / sombre / système)

---

## 5. UI / UX

- Design arrondi, épuré, esprit Slack / SaaS moderne.
- Couleurs d'accent utilisées pour différencier comptes et postes (couleur choisie à la création).
- **Mode clair et sombre**, avec détection de la préférence système au premier lancement et bascule manuelle dans les paramètres.
- Icônes des postes issues d'une bibliothèque prédéfinie (type Lucide) via un sélecteur avec recherche par mot-clé — pas d'upload d'image personnalisée en v1.

---

## 6. Postes préconfigurés proposés (liste de départ)

Une douzaine de postes courants, à ajuster librement dans l'application après installation :

| Poste                    | Icône (suggestion) | Couleur (suggestion)    |
| ------------------------ | ------------------ | ----------------------- |
| Alimentation             | shopping-cart      | #4ADE80 (vert)          |
| Logement                 | home               | #60A5FA (bleu)          |
| Transport                | car                | #FB923C (orange)        |
| Restaurant / Sorties     | utensils           | #F472B6 (rose)          |
| Loisirs                  | party-popper       | #A78BFA (violet)        |
| Santé                    | heart-pulse        | #F87171 (rouge)         |
| Shopping / Habillement   | shirt              | #FBBF24 (jaune)         |
| Abonnements              | repeat             | #38BDF8 (bleu clair)    |
| Salaire                  | banknote           | #34D399 (vert émeraude) |
| Épargne / Investissement | piggy-bank         | #818CF8 (indigo)        |
| Impôts / Taxes           | landmark           | #94A3B8 (gris-bleu)     |
| Divers                   | more-horizontal    | #A8A29E (gris)          |

---

## 7. Périmètre v1 vs évolutions futures

### Inclus en v1

- Gestion multi-comptes indépendants (sans virement natif)
- Postes globaux (liste plate)
- Écritures avec pointage
- Écritures périodiques (hebdo/mensuel/annuel)
- Filtres et raccourcis sur l'écran d'écriture
- Thème clair/sombre
- Pagination / scroll virtuel
- Tests unitaires, intégration, composants, e2e

### Explicitement hors scope v1 (évolutions possibles)

- Support macOS et Linux (v1 : Windows uniquement)
- Virements natifs entre comptes (écritures liées automatiquement)
- Hiérarchie de postes (sous-postes)
- Import / export de données (CSV, OFX...)
- Verrouillage applicatif / chiffrement
- Vue statistique consolidée multi-comptes
- Upload d'icônes personnalisées pour les postes

---

## 8. Décisions ouvertes / non abordées

*(à compléter si des points supplémentaires émergent en cours de développement)*
