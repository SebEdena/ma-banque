/**
 * jsdom has no `ResizeObserver` and no `Element.scrollIntoView` — Spartan's
 * `hlm-select` dropdown uses both (to size the popover and keep the active
 * item in view) whenever a spec actually opens it. Importing this for its
 * side effect installs no-op stand-ins once per process.
 */
/* eslint-disable @typescript-eslint/no-empty-function */
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
/* eslint-enable @typescript-eslint/no-empty-function */
