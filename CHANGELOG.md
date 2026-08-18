# Changelog

All notable changes to this project are documented in this file.

## [0.6.0] - 2026-08-18

### Bug Fixes

- Replace gh workflow run with workflow_call in trigger-release job
- Give the Pointage panel a proper open/close animation and matching field styling
- Unmount the Pointage panel when it collapses

### Documentation

- Spec and break down the 3 remaining layer-3 features

### Features

- Compute and store the reconciliation summary
- Filter the entries list to unreconciled entries
- Build the Pointage panel on the account screen

### Miscellaneous Tasks

- Mark issue 03 done, hand off testid hooks to issue 04
- Add model-tier policy, numeric poll cadence, notes excerpting

### Testing

- Drive the Pointage panel end to end

## [0.5.0] - 2026-08-16

### Bug Fixes

- Keep the label and description focus ring inside the row
- Replace number amount field with a filtered text input
- Interact with the category hlm-select via its combobox DOM
- Default a new row's amount to empty, not a lone sign
- Refresh usage counts when the Postes screen opens
- Reuse appAmountInput for the opening balance field

### Documentation

- Add entries spec and ticket breakdown
- Correct the note on where amount parsing lives

### Features

- Implement entries backend (ticket 01)
- Entries screen with pagination and filters (ticket 02)
- Inline entry create, edit, delete and reconcile (ticket 03)
- Category quick-create from entry row (ticket 04)
- Show an inline error for an unreadable amount, alongside the toast
- Focus-on-click, wider date column, fixed debit/credit colours
- Own the form's validation with Signal Forms, on a number amount field
- Use spartan date picker and tooltips, center date column
- Embed category icon in select, wire filters to spartan picker
- Show category icons in the select's open dropdown

### Miscellaneous Tasks

- Mark ticket 01 done
- Mark ticket 02 done and record cross-issue notes
- Mark ticket 03 done and record cross-issue notes

### Refactor

- Address code review on the inline entry form
- Split account screen into smart container and dumb row/form components
- Scope the inset focus ring to the form that needs it
- Extract paging/CRUD and category state out of Account
- Bind the account id from the route via input()
- Stop CategoryModal/AccountSettingsModal calling the store directly
- Split core/ into true infra, domain data-access, and app shell

### Styling

- Unify entry row field styling and fix select popover sizing

### Testing

- E2e coverage for entries flows and deferred category-delete scenario (ticket 05)
- Assert quick-created category selection portably (ticket 05)

## [0.4.0] - 2026-08-12

### Bug Fixes

- Order names by a case- and accent-insensitive collation
- Revert tauri-action to v1 — v2 doesn't exist

### Build

- Integrate stylelint for CSS linting

### CI/CD

- Fall back to the nearest npm cache instead of a full miss
- Bump tauri-action to v2 to clear Node 20 deprecation warning
- Use PAT for release dispatch to avoid GITHUB_TOKEN permission cap
- Use PAT for release creation, GITHUB_TOKEN intermittently lacks rights
- Bump actions/cache to v6 to clear remaining Node 20 warning

### Documentation

- Mark the categories backend issue done

### Features

- Add the category backend with its seeded starting list
- Build the Postes tab category management panel
- Widen the palette so every seeded category has its own colour

### Miscellaneous Tasks

- Skip chore(agent) commits from generated changelog

### Testing

- Cover category create/edit/delete from the Postes tab

## [0.3.0] - 2026-08-11

### Bug Fixes

- Replace per-issue /compact with issue-agent respawn
- Replace per-PR pr-agent with single manager polling loop
- Always spawn fresh feature agents, never resume idle ones
- Match home screen to design.html mockup
- Match archived view and modal sizing to design.html
- Match sidebar rail and colour swatches to design.html
- Fix sidebar full height, ring clipping and spacing
- Fix top-clipped ring on first sidebar account, apply css-styleguide review

### Documentation

- Require e2e coverage for new business-facing flows
- Record how to extend the sidebar rail

### Features

- Add the accounts backend and its minimal entries table
- Add shared icon and colour pickers
- Show accounts as cards on the home screen
- Add the shared create/edit account settings modal
- Restore and delete accounts from the archived view
- Mock the Tauri backend for browser-only visual checks

### Miscellaneous Tasks

- Add visual QA recordings for the accounts feature

### Testing

- Assert the routed shell renders the accounts home screen
- Cover account create/archive/restore/delete
- Auto-discover grouped spec files in wdio.conf.ts

## [0.2.3] - 2026-08-08

### CI/CD

- Extract release dispatch into its own job, drop RELEASE_PAT

## [0.2.2] - 2026-08-08

### CI/CD

- Warm the release cache in bump-version, revert to bundling both installers
- Dispatch release.yml only after the cache is warm

## [0.2.0] - 2026-08-08

### Bug Fixes

- Isolate vitest module registry per spec file
- Normalize data-folder paths and hot-swap the live DB connection

### CI/CD

- Stop compiling tauri-cli from source, dedupe Windows Rust builds
- Push with RELEASE_PAT so tag push triggers Release
- Bundle NSIS installer only

### Documentation

- Sharpen fullstack-agent workflow and criteria
- Add layer-1 specs and Matt Pocock agent-skills config
- Let fullstack-agent run features concurrently
- Reconcile layer-1 specs against the existing prototype
- Add rust-best-practices skill
- Resolve grilling open questions and pin money/error conventions
- Add fullstack-agent safeguards and resume support
- Vendor angular-developer/implement/tdd/code-review/conventional-commits, harden fullstack-agent pr-agent
- Break down 05-settings-remainder.md into implementation tickets
- Break down 03-accounts.md and 04-categories.md into implementation tickets
- Schedule context compaction in fullstack-agent's workflow
- Tick verified acceptance criteria on settings-remainder issues

### Features

- Add display-settings backend (date/currency format)
- Add first-launch/unreachable-folder blocking prompt
- Add Settings screen shell and Affichage tab
- Add Stockage tab move/open folder actions
- Add temporary demo of display-format settings

### Miscellaneous Tasks

- Mark ticket 01 (settings backend) done
- Mark ticket 03 (first-launch folder prompt) done
- Mark ticket 02 (shell + Affichage tab) done
- Mark ticket 04 (Stockage tab) done

### Refactor

- Address PR review — English identifiers, French errors
- Extract accessible option-toggle-group for Affichage tab
- Move spartan components under shared/components

### Styling

- Match design.html visual language

### Testing

- Stub window.matchMedia to silence hlm-toaster render errors
- Stub get_display_settings with a valid shape

## [0.1.1] - 2026-08-06

### Bug Fixes

- Align routing skeleton with docs/design/design.html
- Make app.routes.spec.ts's Tauri mock order-independent
- Stub window.**TAURI_INTERNALS** instead of mocking @tauri-apps/api/core
- Use platform-correct binary path, cache cargo-installed CLI tools
- Work around WebView2 150 elevated remote-debugging-port regression
- Grant contents:read to the changes job
- Quiet wdio protocol logging so spec results aren't buried
- Align HTML <title> with the native window title
- Make the release tag annotated so it actually gets pushed

### CI/CD

- Add GitHub Actions push/PR, e2e, and release workflows
- Bump actions/checkout and actions/setup-node to v5
- Gate rust/frontend/e2e jobs on changed paths, bump actions/cache to v5
- Add version-bump workflow with changelog generation
- Bump dorny/paths-filter to v4 to clear Node 20 deprecation warning
- Cache the cargo-installed tauri-cli binary

### Documentation

- Import claude design file
- Setup backend tickets
- Reconcile business requirements with design prototype
- Design data folder storage, migration backups & downgrade guard
- Setup frontend tickets
- Fix stale "single file" storage line in business requirements
- Mark setup tickets 01 and 02 as done
- Add basic command reference to README
- Correct clippy command in ticket 05 notes
- Add CI/CD workflows section to README

### Features

- Scaffold Tauri/Rust crate with Clean Architecture layout
- Wire shared SQLite connection and migration runner
- Data folder location command + migration backup/downgrade guard
- Angular scaffold, spartan/ui, theming & routing skeleton
- WebdriverIO e2e smoke test against compiled Tauri app
- Dev-mode local data folder for debug builds
- Home screen invoke() proof against get_current_data_folder
- Wire up tauri-plugin-wdio for execute()/mock() support

### Refactor

- Manage data folder repository as a boxed trait object
