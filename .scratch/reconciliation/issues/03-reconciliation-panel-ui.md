# 03 — Reconciliation panel UI

**What to build:** The collapsible "Pointage" panel on the account/entries screen — reconciled balance, editable bank balance, editable statement date, signed delta with red/green verdict, and the "unreconciled only" filter checkbox coupled to the panel's open/closed state. Done when a user can reconcile an account entirely through this panel.

**Blocked by:** 01, 02 — needs the summary/write commands and the backend filter parameter.

**Status:** done

- [x] New `ReconciliationApi` injectable service under `src/app/data/reconciliation`, wrapping `invoke()` for the three commands — never called directly via `invoke()` from components.
- [x] Panel is a presentational component: inputs for the summary and the account's accent colour; outputs for bank-balance change, statement-date change, and the filter checkbox toggle. Shows a "set a statement date" prompt instead of figures when the statement date is absent, rather than a guessed default.
- [x] Panel-open/filter coupling lives in `Account` as two signals (`panelOpen`, `unreconciledOnly`), with the effective filter as `computed(() => panelOpen() && unreconciledOnly())` feeding the existing `query()` builder. Opening the panel sets `unreconciledOnly` to `true`; closing the panel disables the filter's effect regardless of the checkbox's value (collapsing always restores the full list). `panelOpen` starts `false` on every screen entry, never persisted.
- [x] The filter checkbox is disabled/greyed when the unreconciled count is zero.
- [x] Toggling a row's reconciled checkbox while the filter is **active** reloads the current page (the row no longer matches the predicate) rather than patching in place; while the filter is **inactive**, `EntriesPager.setReconciled`'s existing in-place patch is unchanged. Either way, the summary refetches after a toggle.
- [x] The four `--pointage-*` theme tokens exist in both light and dark palettes. Delta renders **signed**, coloured `--pointage-ok` at exactly zero and `--pointage-bad` otherwise. Panel controls (toggle button, checkbox, inputs) carry the account's accent colour; the verdict colours do not.
- [x] A non-numeric bank balance shows an inline error next to the field without emitting; a rejected command surfaces as a toast.
- [x] Angular component tests (Vitest) for the panel component with a mocked summary input: renders reconciled balance/bank balance/statement date/delta; green verdict at zero delta, red otherwise; signed delta rendered; the statement-date prompt shown when absent; checkbox disabled when unreconciled count is zero; emits its three outputs on edit; shows inline error for non-numeric bank balance without emitting.
- [x] Angular component tests (Vitest) for `Account`, mocking `ReconciliationApi`/`EntriesApi` (never `invoke()`): panel absent/collapsed on load; "Pointage" toggle opens it and requests the summary; opening checks "unreconciled only" and re-requests entries with the flag; unchecking re-requests without it; **collapsing the panel re-requests without the flag even though the checkbox stayed checked**; toggling a row with the filter active reloads the list and refetches the summary; toggling with the filter inactive keeps the in-place patch and still refetches the summary; editing bank balance/statement date call the matching `ReconciliationApi` methods and update the displayed figures.
