# Changelog

All notable changes to this project are documented in this file.

## [0.1.1] - 2026-08-06

### Bug Fixes

- Align routing skeleton with docs/design/design.html
- Make app.routes.spec.ts's Tauri mock order-independent
- Stub window.**TAURI_INTERNALS** instead of mocking @tauri-apps/api/core
- Use platform-correct binary path, cache cargo-installed CLI tools
- Work around WebView2 150 elevated remote-debugging-port regression
- Grant contents:read to the changes job
- Quiet wdio protocol logging so spec results aren't buried

### CI/CD

- Add GitHub Actions push/PR, e2e, and release workflows
- Bump actions/checkout and actions/setup-node to v5
- Gate rust/frontend/e2e jobs on changed paths, bump actions/cache to v5
- Add version-bump workflow with changelog generation
- Bump dorny/paths-filter to v4 to clear Node 20 deprecation warning

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
