# Cross-issue notes

- 05-settings-nav-simplify: the Settings section switcher uses the existing `hlm-select` (spartan/ui) component, not a native `<select>` — consistent with the rest of the app's select usage (e.g. `entry-form.html`'s category picker). Any later Settings-shell work should keep using `hlm-select` for consistency rather than introducing a native `<select>` or a different picker.
- 05-settings-nav-simplify: `settings.css` (empty/unused) was deleted along with the sidebar markup it styled nothing for.
