import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements neither the Pointer Capture API nor scrollIntoView, and a
 * Radix Select calls both the moment it is opened with a real click. Without
 * these the dropdown throws instead of opening, so a test can only ever check
 * the trigger — never what the user picked.
 *
 * These are environment gaps, not behaviour: the browser has all three.
 */
if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
}

if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
}
