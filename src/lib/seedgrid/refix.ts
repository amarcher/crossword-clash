/**
 * Pure helpers for `pnpm seedgrid:refix` (scripts/seedgrid/refix.mts), which
 * rejects one forced entry and refills its neighbourhood. The ring geometry,
 * the blanking and the candidate ranking live here; the engine calls stay in
 * the CLI.
 */
import { cloneGrid, slotsOf, slotText, type Grid, type Slot } from "./grid";

/**
 * The slots within `depth` crossings of `target`: depth 0 is the target
 * itself, 1 its crossings, 2 their crossings, and so on. The target is always
 * included.
 */
export function ringSlots(slots: Slot[], target: Slot, depth: number): Slot[] {
  let ring: Slot[] = [target];
  for (let d = 0; d < depth; d++) {
    const cells = new Set(ring.flatMap((s) => s.cells));
    ring = slots.filter((o) => o.cells.some((c) => cells.has(c)));
  }
  return ring.some((s) => s.id === target.id) ? ring : [target, ...ring];
}

/** A copy of the grid with every unlocked cell of the given slots emptied, and how many were. */
export function blankSlots(grid: Grid, slots: Slot[]): { grid: Grid; freed: number } {
  const blank = cloneGrid(grid);
  let freed = 0;
  for (const s of slots) {
    for (const i of s.cells) {
      if (blank.locked[i] || blank.cells[i] === "#" || blank.cells[i] === "") continue;
      blank.cells[i] = "";
      freed++;
    }
  }
  return { grid: blank, freed };
}

export interface ChangedEntry {
  slotId: string;
  before: string;
  after: string;
  score: number | undefined;
}

/** Slots whose entry differs between two fills of the same skeleton. */
export function changedEntries(before: Grid, after: Grid, scores: Map<string, number>): ChangedEntry[] {
  const was = new Map(slotsOf(before).map((s) => [s.id, slotText(before, s)]));
  return slotsOf(after)
    .map((s) => ({ slotId: s.id, before: was.get(s.id) ?? "", after: slotText(after, s), score: scores.get(slotText(after, s)) }))
    .filter((e) => e.before !== e.after);
}

export interface RefixCandidate {
  grid: Grid;
  /** Fill quality (`scoreFill(...).total`): higher is better. */
  total: number;
  changed: ChangedEntry[];
  depth: number;
}

/** The weakest new entry's list score, or 0 when a new entry is off the list. */
export function lowestChangedScore(changed: ChangedEntry[]): number {
  return changed.length ? Math.min(...changed.map((e) => e.score ?? 0)) : Infinity;
}

/** Same set of replacements, whatever order the engine listed them in. */
export function candidateKey(changed: ChangedEntry[]): string {
  return changed
    .map((e) => `${e.slotId}:${e.after}`)
    .sort()
    .join(" ");
}

/**
 * Best first: the candidate whose weakest replacement scores highest, then
 * the better fill overall, then the smaller change. A candidate that changes
 * nothing is not a fix and sorts last.
 */
export function rankCandidates<T extends RefixCandidate>(cands: T[]): T[] {
  return [...cands].sort((a, b) => {
    const aLow = a.changed.length ? lowestChangedScore(a.changed) : -Infinity;
    const bLow = b.changed.length ? lowestChangedScore(b.changed) : -Infinity;
    return bLow - aLow || b.total - a.total || a.changed.length - b.changed.length;
  });
}

/** The ring is deep enough once some candidate's weakest replacement reaches `goodScore`. */
export function depthSatisfied(cands: RefixCandidate[], depth: number, goodScore = 60): boolean {
  return cands.some((c) => c.depth === depth && c.changed.length > 0 && lowestChangedScore(c.changed) >= goodScore);
}
