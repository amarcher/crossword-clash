/**
 * Why a fill failed, in terms the constructor can act on.
 *
 * The engine only answers "unfillable". Its arc-consistency pass (the
 * heatmap) can point at one entry with no option at all, but when every
 * entry still has options and the search proves the grid impossible, nothing
 * in the result says where. So after a failed fill the studio probes the
 * constructor's own choices one at a time — drop one entry's approvals, clear
 * one locked entry, lower the score floor — and reports the first change that
 * lets the grid fill, with the cells to paint. Pure except `diagnoseFill`,
 * which takes the engine calls so tests can fake them.
 */
import { cloneGrid, slotsOf, slotText, type Grid, type Slot } from "./grid";
import type { EngineRules, FillOutcome, SlotOptions } from "./ingrid";

/** The lowest floor the studio's slider offers; the score probe fills at it. */
export const LOWEST_SCORE = 30;
/** At most this many probes per failed fill, so a 15×15 with many themers stays quick. */
export const MAX_PROBES = 10;
/** Per-probe time budget: unfillable proofs take milliseconds, a real fill a second or so. */
export const PROBE_MS = 1500;

export interface FillProbe {
  kind: "approvals" | "entry" | "score";
  /** The slot this probe relaxes (approvals, entry). */
  slot?: Slot;
  /** The locked word cleared by an entry probe. */
  word?: string;
  /** The floor a score probe lowered from. */
  from?: number;
  grid: Grid;
  rules: EngineRules;
}

export type FillDiagnosis =
  | { kind: "dead"; slot: Slot; cells: number[]; message: string }
  | { kind: "culprit"; probe: FillProbe; cells: number[]; message: string }
  | { kind: "unknown"; cells: number[]; message: string };

const FAILED = "This grid can't be filled with these rules.";

/** Slots the arc-consistency pass left with no option (the engine lists only those it can name). */
export function deadSlots(grid: Grid, counts: Record<string, number>): Slot[] {
  return slotsOf(grid).filter((s) => counts[s.id] === 0);
}

const isLocked = (grid: Grid, cell: number) => grid.locked[cell] && !!grid.cells[cell] && grid.cells[cell] !== "#";

/** Entries the constructor wrote in full, longest first (theme entries are the usual culprits). */
export function lockedEntries(grid: Grid): Slot[] {
  return slotsOf(grid)
    .filter((s) => s.cells.every((c) => isLocked(grid, c)))
    .sort((a, b) => b.cells.length - a.cells.length);
}

/**
 * One probe per choice the constructor made: approvals first (cheap and the
 * likeliest), then each locked entry cleared — keeping any letter another
 * locked entry shares, so the question stays "does the grid fill without
 * this word?" — then the score floor dropped to the slider's minimum.
 */
export function fillProbes(grid: Grid, rules: EngineRules, max = MAX_PROBES): FillProbe[] {
  const probes: FillProbe[] = [];
  const slots = slotsOf(grid);
  for (const slot of slots) {
    if (!rules.approved?.[slot.id]?.length) continue;
    const approved = { ...rules.approved };
    delete approved[slot.id];
    probes.push({ kind: "approvals", slot, grid, rules: { ...rules, approved } });
  }
  const locked = lockedEntries(grid);
  for (const slot of locked) {
    const others = new Set(locked.filter((o) => o !== slot).flatMap((o) => o.cells));
    const probe = cloneGrid(grid);
    for (const cell of slot.cells) {
      if (others.has(cell)) continue;
      probe.cells[cell] = "";
      probe.locked[cell] = false;
    }
    // A word made only of shared letters leaves nothing to clear.
    if (slot.cells.every((c) => others.has(c))) continue;
    probes.push({ kind: "entry", slot, word: slotText(grid, slot), grid: probe, rules });
  }
  if (rules.minScore > LOWEST_SCORE) {
    const { minScoreBySlot: _drop, ...rest } = rules;
    probes.push({ kind: "score", from: rules.minScore, grid, rules: { ...rest, minScore: LOWEST_SCORE } });
  }
  return probes.slice(0, max);
}

function describe(probe: FillProbe): string {
  switch (probe.kind) {
    case "approvals":
      return `The approved words for ${probe.slot!.id} don't cross anything. Clear them and the grid fills.`;
    case "entry":
      return `${probe.word} (${probe.slot!.id}) is in the way: without it the grid fills. Move it, or change a black square near it.`;
    case "score":
      return `Nothing fills at a score floor of ${probe.from}, but it does at ${LOWEST_SCORE}. Lower the floor, or move a black square.`;
  }
}

export interface DiagnosisEngine {
  options(grid: Grid, rules: EngineRules): Promise<SlotOptions>;
  fill(grid: Grid, rules: EngineRules): Promise<FillOutcome>;
}

/**
 * Explain a failed fill: the dead slot when arc consistency names one, else
 * the first probe that fills, else an honest "no single cause". Rejects only
 * when the engine does (a Stop restarts the worker and rejects the probes).
 */
export async function diagnoseFill(grid: Grid, rules: EngineRules, engine: DiagnosisEngine): Promise<FillDiagnosis> {
  const dead = deadSlots(grid, (await engine.options(grid, rules)).counts);
  if (dead.length) {
    const slot = dead[0];
    return {
      kind: "dead",
      slot,
      cells: slot.cells,
      message: `${FAILED} Nothing fits ${slot.id} (${slotText(grid, slot)}). Change a letter or a black square there.`,
    };
  }
  for (const probe of fillProbes(grid, rules)) {
    const res = await engine.fill(probe.grid, probe.rules);
    if (!res.ok) continue;
    const cells = probe.slot?.cells ?? [];
    return { kind: "culprit", probe, cells, message: `${FAILED} ${describe(probe)}` };
  }
  return {
    kind: "unknown",
    cells: [],
    message: `${FAILED} No single entry is the cause. Try another black square, fewer approvals or a lower score floor.`,
  };
}
