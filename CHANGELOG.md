# Changelog

All notable changes to this project are documented in this file.

## [0.2.0] - 2026-08-08

### Bug Fixes

- Isolate vitest module registry per spec file
- Normalize data-folder paths and hot-swap the live DB connection

### CI/CD

- Stop compiling tauri-cli from source, dedupe Windows Rust builds

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
