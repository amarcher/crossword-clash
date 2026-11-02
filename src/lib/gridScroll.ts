/**
 * Scrolling the active cell into view on the phone play screen. The grid
 * fills the screen width and never shrinks (Andrew, 2026-10-30), so with the
 * on-screen keyboard up its bottom rows sit under the clue bar and the keys.
 * CrosswordGrid scrolls its scroller by exactly the overshoot — and not at
 * all while the cell is visible, so typing along a row never moves the grid.
 */

export interface RevealInput {
  /** The cell's edges, viewport coordinates. */
  top: number;
  bottom: number;
  /** The part of the scroller the player can actually see (clue bar and keyboard excluded). */
  visibleTop: number;
  visibleBottom: number;
  /** Breathing room past the edge, px. */
  margin?: number;
}

export const REVEAL_MARGIN = 8;

/**
 * The change in `scrollTop` that brings the cell inside the visible band:
 * positive to scroll down (the cell was under the bar), negative to scroll
 * up, 0 when nothing needs to move.
 */
export function scrollDeltaToReveal({ top, bottom, visibleTop, visibleBottom, margin = REVEAL_MARGIN }: RevealInput): number {
  if (bottom > visibleBottom) return Math.ceil(bottom - visibleBottom + margin);
  if (top < visibleTop) return -Math.ceil(visibleTop - top + margin);
  return 0;
}

/** The nearest ancestor that scrolls vertically, or null (the apps' grid slot has none). */
export function scrollParent(el: Element | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}
