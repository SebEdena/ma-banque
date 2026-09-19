# Cross-issue notes

- 05-settings-nav-simplify: reverted on PR review (ma-banque#16) — the `hlm-select` section switcher was replaced back with the original sidebar nav list. The reviewer confirmed the sidebar was the right mechanism; the ask was to restyle its rows (and the Affichage tab's content rows) with hairline dividers approximating a reference screenshot, not to swap it for a dropdown. Any later Settings-shell work should keep the sidebar nav, not reintroduce a select for section switching.
- `settings.css` stays deleted (it was empty/unused before the revert too) — the reverted sidebar template no longer references a `styleUrl`.
