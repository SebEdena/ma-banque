# 04 — Home screen: end-to-end Tauri wiring proof

**What to build:** The home screen calls the real data-folder-location "get" Tauri command from the backend scaffold and renders the returned value (or "no folder set" state) as plain text — the single proof that `invoke()` plumbing works end-to-end between Angular and the Rust backend, before any business feature exists.

Scope, per `docs/spec/02-setup-frontend-ci.md`:

- Home screen route (placeholder from ticket 02) invokes the "get current folder" command built in `docs/spec/01-setup-backend.md` (backend ticket `03-data-file-location-command`, now scoped to a folder pointer per business requirements §2.3.1).
- Renders the returned value (folder path, or the distinct "no pointer set" result) as plain text — not a real feature, and should be replaced once the account-list home screen (business requirements §4.1) is built. The first-launch "use default / choose a folder" prompt itself is out of scope here — this ticket only proves the `invoke()` plumbing, not the onboarding UX.
- Component test with a _mocked_ Tauri API asserting the home screen displays the value returned by the mocked command.

Out of scope: any real home-screen business content (account cards, balances, reconciliation indicators — business requirements §4.1), the e2e smoke test itself (ticket 03, though it may now also observe this screen), the first-launch/"folder unreachable" prompt UI and the Settings screen's Move/Open-a-different-folder actions (future Settings screen work, business requirements §4.6).

**Blocked by:** ~~02 — Theme detection & routing skeleton~~ (done); externally by backend ticket `03-data-file-location-command` (~~`docs/spec/01-setup-backend.md`~~, done) — the Tauri command this ticket calls now exists.

**Status:** done

- [x] Home screen invokes the "get current folder" Tauri command on load
- [x] The returned value (or "no pointer set" state) is rendered as plain text on the home screen
- [x] A component test mocks the Tauri API and asserts the home screen displays the mocked value
- [x] No business logic (account cards, balances, reconciliation) or onboarding/Settings UI is introduced

**Implementation notes:**

- `@tauri-apps/api` added as a runtime dependency; `Home` calls `invoke<string | null>('get_current_data_folder')` in its constructor and stores the result in a `dataFolder` signal, rendered as plain text (`Aucun dossier configuré` for the "no pointer set" `null` case) — French, matching the rest of the shipped UI.
- Component test mocks `@tauri-apps/api/core` via `vi.mock`; `app.routes.spec.ts` needed the same mock (defaulted to `null`) since it renders `Home` through the router harness and would otherwise hit the real (unavailable in tests) Tauri bridge, producing an unhandled rejection.
- The command's `Err` case (not just the `Ok(None)` "no pointer set" case) is caught and logged via `console.error` — added after code review flagged the original code as silently rendering the same "no folder" text on a real backend error as on the legitimate empty state, with an unhandled promise rejection to boot.
