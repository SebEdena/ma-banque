# 03 — Statistics screen UI

**What to build:** The full Statistiques screen — entry point, period/account selectors, and both charts. Done when a user can open statistics from an account, switch period and account, and see both the expense-by-poste donut and the income/expense-by-month bar chart with accurate data.

**Blocked by:** 01, 02.

**Status:** ready-for-agent

- [ ] `StatisticsApi` injectable service (`src/app/data/statistics`, mirroring `EntriesApi`/`CategoriesApi`) wraps `invoke()` for the two aggregate commands.
- [ ] New routed `Statistics` screen: title, "Voir le compte" button back to the account, a four-preset segmented period control (1/3/6/12 mois), an account-pill row (fed by `AccountsApi.listAccounts()`, colour dot + name, active pill selected), and the two chart cards. Changing the period or the selected account re-requests both aggregates; the chosen period persists across an account switch.
- [ ] The entries screen's account header gains a "Statistiques" button (beside "Pointage"/"Paramètres") that routes here with the current account preselected.
- [ ] Donut card: built with Unovis's `Donut` component, `colorAccessor` per bucket (including the "Sans poste" neutral colour), `centralLabel`/`centralSubLabel` showing the formatted total and "Total dépenses" caption. Legend (hand-built, not a Unovis feature): colour swatch, name, percentage, right-aligned monospace amount, one row per bucket. Empty state ("Aucune dépense sur cette période.") replaces the whole chart+legend block when the breakdown is empty.
- [ ] Monthly card: built with Unovis's `GroupedBar` inside an `XYContainer`, two y-accessors per month (income/expense) coloured via `colorAccessor` with the existing `--positive`/`--negative` tokens, month labels on the x-axis, hover tooltips via Unovis's built-in `Tooltip`. Hand-built legend naming the two colours "Recettes"/"Dépenses".
- [ ] Amounts/dates render through `DisplaySettingsService`'s existing `currency-format`/`date-format` pipes.
- [ ] The selected account's accent colour drives the screen's interactive elements (active period preset, active account pill, button hovers).
- [ ] A failing aggregate request surfaces as a toast.
- [ ] Angular component tests (Vitest) for `Statistics` against a mocked `StatisticsApi` (never `invoke()` directly): both aggregates requested for the preselected account on load; a period-preset change re-requests both with the new period; an account-pill change re-requests both for that account, keeping the chosen period; the `Donut` component receives one data point per bucket with expected colour/value, and the hand-built legend renders one row per bucket with the returned colours/names/percentages/amounts; the empty-breakdown state renders when appropriate; the `GroupedBar` component receives one data point per month (including zero-valued ones) with both series populated; a failing API call surfaces a toast. Assertions target the data bound into the Unovis components and the legend's rendered rows, never Unovis's internal SVG output.
- [ ] Angular component test for the entries screen's new entry point: the "Statistiques" button navigates to the statistics screen with the current account preselected.
