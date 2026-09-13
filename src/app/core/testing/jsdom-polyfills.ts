/**
 * jsdom has no `ResizeObserver` and no `Element.scrollIntoView` — Spartan's
 * `hlm-select` dropdown uses both (to size the popover and keep the active
 * item in view) whenever a spec actually opens it. Importing this for its
 * side effect installs no-op stand-ins once per process.
 *
 * jsdom also has no SVG layout engine, so `SVGElement.getBBox()` and
 * `SVGElement.getComputedTextLength()` don't exist — Unovis's `Donut`,
 * `GroupedBar` and `Axis` (`docs/spec/09-statistics.md`) call both while
 * auto-sizing the chart's margins and central label, which would otherwise
 * throw during the statistics screen's tests.
 *
 * jsdom also has no `transform`/`SVGAnimatedTransformList` on SVG elements —
 * d3-interpolate's `parseSvg` reads `node.transform.baseVal` to interpolate a
 * `transform` attribute across a transition, which Unovis's `Donut` animates
 * (since `@unovis/ts` 1.7.0) for its background arc. Without this, every
 * donut re-render throws an unhandled `TypeError` from inside d3's
 * animation-frame timer, well after the triggering test has finished.
 */
/* eslint-disable @typescript-eslint/no-empty-function */
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
SVGGraphicsElement.prototype.getBBox ??= () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
// `getComputedTextLength` belongs to `SVGTextContentElement`, a global jsdom
// doesn't expose at all (unlike `SVGGraphicsElement`, which exists but lacks
// `getBBox`) — patch the base `SVGElement` prototype instead, which every
// concrete SVG element (including `<tspan>`) inherits from.
(SVGElement.prototype as { getComputedTextLength?: () => number }).getComputedTextLength ??= () =>
  0;
if (!('transform' in SVGElement.prototype)) {
  Object.defineProperty(SVGElement.prototype, 'transform', {
    configurable: true,
    get: () => ({ baseVal: { consolidate: () => null } }),
  });
}
/* eslint-enable @typescript-eslint/no-empty-function */
