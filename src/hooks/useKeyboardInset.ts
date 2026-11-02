import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * How much of the bottom of the layout viewport the on-screen keyboard (with
 * its accessory bar) covers, in CSS px. iOS never shrinks the layout
 * viewport for the keyboard — `100vh`, `100dvh` and `100svh` all stay full
 * height — so `window.visualViewport` is the one signal: the keyboard is
 * whatever the visual viewport leaves uncovered below it.
 */
export interface VisualViewportSize {
  height: number;
  offsetTop: number;
}

/** Pure: the covered height, never negative. 0 without a visual viewport. */
export function keyboardInset(layoutHeight: number, vv: VisualViewportSize | null | undefined): number {
  if (!vv) return 0;
  return Math.max(0, Math.round(layoutHeight - vv.height - vv.offsetTop));
}

/** The inset right now, read from the document. 0 outside a browser. */
export function readKeyboardInset(): number {
  if (typeof window === "undefined" || !window.visualViewport) return 0;
  return keyboardInset(document.documentElement.clientHeight, window.visualViewport);
}

/**
 * The keyboard inset, kept current (rAF-throttled on the visual viewport's
 * resize and scroll). Always 0 in the apps, whose play screen uses the in-app
 * keyboard, and in a browser without `visualViewport`. The clue bar sits on
 * it; the play layout pads its scroller by it so the grid can scroll up past
 * the keys.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const vv = window.visualViewport;
    if (!vv) return;
    let rafId = 0;
    const update = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => setInset(readKeyboardInset()));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(rafId);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
