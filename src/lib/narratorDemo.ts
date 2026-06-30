/**
 * Client-side narrator demo meter.
 *
 * A first-time TV host should always get to *hear* the AI narrator briefly,
 * even when the owner's monthly budget cap has already been reached. This thin
 * localStorage wrapper tracks how many demo events this browser has spent so
 * the narrator can sample a few comments on the cheapest path before going
 * quiet. The hard cost ceiling still lives server-side; this is only a UX
 * nicety so newcomers don't see a dead feature.
 *
 * All arithmetic lives in the pure, tested `narratorBudget` module — this file
 * just reads/writes the counter and degrades to "no demo" if storage is
 * unavailable.
 */

import {
  demoEventsRemaining,
  hasDemoRemaining as hasDemoRemainingPure,
} from "./narratorBudget";

const DEMO_STORAGE_KEY = "crossword-clash-narrator-demo";

function readConsumed(): number {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeConsumed(value: number): void {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, String(Math.max(0, Math.floor(value))));
  } catch {
    // Storage unavailable (private mode / quota) — demo simply won't persist.
  }
}

/** Whether this browser still has demo events left to sample. */
export function hasNarratorDemoRemaining(): boolean {
  return hasDemoRemainingPure(readConsumed());
}

/** How many demo events remain for this browser. */
export function narratorDemoRemaining(): number {
  return demoEventsRemaining(readConsumed());
}

/**
 * Consume one demo event. Returns true if a demo event was available (and is
 * now spent), false if the allowance was already exhausted.
 */
export function consumeNarratorDemo(): boolean {
  const consumed = readConsumed();
  if (!hasDemoRemainingPure(consumed)) return false;
  writeConsumed(consumed + 1);
  return true;
}
