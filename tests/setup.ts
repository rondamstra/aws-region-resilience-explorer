/**
 * Vitest setup — referenced by vitest.config.proposal.ts.
 *
 * Extends `expect` with @testing-library/jest-dom matchers (toBeVisible,
 * toBeInTheDocument, toHaveAttribute, ...). Imported once per test run.
 */
import '@testing-library/jest-dom/vitest';

/**
 * jsdom does not implement these browser APIs that maplibre-gl touches at
 * module-load and map-construction time. The MapView component already guards
 * WebGL in a try/catch (falling back to its accessible DOM mirror), but the
 * maplibre module runs `window.URL.createObjectURL(...)` as a top-level side
 * effect on import — so it must exist before the component module is imported.
 * These are TEST-ENVIRONMENT shims, not changes to src/.
 */
if (typeof URL.createObjectURL !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:stub';
}
if (typeof URL.revokeObjectURL !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
}

// jsdom has no WebGL: HTMLCanvasElement.getContext is unimplemented and throws
// noisily inside maplibre's Map constructor. MapView catches that and falls
// back to its accessible DOM mirror (the thing we assert on), so force the
// canvas path to return null rather than throw — keeping the fallback
// deterministic and the test output clean. Not a change to src/.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext =
    (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
