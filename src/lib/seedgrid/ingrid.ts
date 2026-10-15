/**
 * Typed front end for the ingrid_core WebAssembly engine (engine/, built by
 * `pnpm build:engine` into ./wasm). It speaks in our Grid and slot ids ("5A")
 * and translates to the engine's start-cell addressing.
 *
 * The engine is synchronous and can run for seconds, so the studio calls it
 * from engine.worker.ts; tests call it directly.
 */
import { cloneGrid, gridFromRows, gridToRows, slotsOf, slotText, type Grid, type Slot } from "./grid";
import type { Engine } from "./wasm/seedgrid_engine";

export interface EngineRules {
  minScore: number;
  /** Slot id → the only words allowed there (approvals). */
  approved?: Record<string, string[]>;
  /** Slot id → a different score floor for that slot. */
  minScoreBySlot?: Record<string, number>;
  /** Words banned everywhere unless already written in the grid. */
  rejected?: string[];
}

export type FillOutcome =
  | { ok: true; grid: Grid; ms: number }
  | { ok: false; reason: "unfillable" | "timeout" | "bad-request"; ms: number };

export interface SlotOptions {
  /** False when the grid is already provably unfillable. */
  ok: boolean;
  /**
   * Slot id → words still possible there (the heatmap). Fixed slots count 1.
   * When one slot has no option at all, only that slot is reported (as 0);
   * when arc consistency fails as a whole, every slot is 0.
   */
  counts: Record<string, number>;
  /** Surviving words for the requested slot, best score first. */
  words?: { word: string; score: number }[];
}

/** "good": a full fill exists with it; "nogood": proven impossible; "unknown": ran out of time. */
export type Viability = "good" | "nogood" | "unknown";

interface SlotRule {
  start: number;
  dir: "across" | "down";
  allow?: string[];
  minScore?: number;
}

function slotRules(slots: Slot[], rules: EngineRules): SlotRule[] {
  return slots
    .filter((s) => rules.approved?.[s.id] || rules.minScoreBySlot?.[s.id] !== undefined)
    .map((s) => ({ start: s.cells[0], dir: s.dir, allow: rules.approved?.[s.id], minScore: rules.minScoreBySlot?.[s.id] }));
}

const slotKey = (start: number, dir: string) => `${start}${dir}`;

/** Fewer words than this means the response wasn't a word list (e.g. an SPA fallback page). */
export const MIN_WORD_LIST_WORDS = 1000;

/** Throws unless a fetched word list looks like `WORD;SCORE` lines rather than an HTML page. */
export function checkWordListResponse(status: number, contentType: string | null, text: string): void {
  if (status < 200 || status >= 300) throw new Error(`word list ${status}`);
  if (/html/i.test(contentType ?? "") || /^\s*</.test(text)) throw new Error("word list missing (got an HTML page)");
}

export class IngridEngine {
  private readonly engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  get wordCount(): number {
    return this.engine.wordCount();
  }

  fill(grid: Grid, rules: EngineRules, opts: { timeoutMs?: number; seed?: number } = {}): FillOutcome {
    const res = JSON.parse(
      this.engine.fill(
        JSON.stringify({
          rows: gridToRows(grid),
          minScore: rules.minScore,
          slots: slotRules(slotsOf(grid), rules),
          reject: rules.rejected ?? [],
          timeoutMs: opts.timeoutMs,
          seed: opts.seed,
        }),
      ),
    );
    if (!res.ok) return { ok: false, reason: res.reason, ms: res.ms };
    const filled = gridFromRows(res.rows);
    return { ok: true, grid: { ...cloneGrid(grid), cells: filled.cells }, ms: res.ms };
  }

  options(grid: Grid, rules: EngineRules, listSlot?: string, listLimit = 200): SlotOptions {
    const slots = slotsOf(grid);
    const target = listSlot ? slots.find((s) => s.id === listSlot) : undefined;
    const res = JSON.parse(
      this.engine.options(
        JSON.stringify({
          rows: gridToRows(grid),
          minScore: rules.minScore,
          slots: slotRules(slots, rules),
          reject: rules.rejected ?? [],
          listSlot: target ? { start: target.cells[0], dir: target.dir } : undefined,
          listLimit,
        }),
      ),
    ) as { ok: boolean; slots: { start: number; dir: string; count: number }[]; words?: { word: string; score: number }[] };
    const byKey = new Map(res.slots.map((s) => [slotKey(s.start, s.dir), s.count]));
    const counts: Record<string, number> = {};
    for (const s of slots) {
      const n = byKey.get(slotKey(s.cells[0], s.dir));
      if (n !== undefined) counts[s.id] = n;
      else if (!res.ok && !res.slots.length) counts[s.id] = 0;
    }
    return { ok: res.ok, counts, words: res.words };
  }

  /**
   * Ingrid's speculative check: try a full fill with each word in the slot.
   * The time budget is per word, so keep the list short.
   */
  classify(grid: Grid, slotId: string, words: string[], rules: EngineRules, timeoutMs = 400): Record<string, Viability> {
    const slot = slotsOf(grid).find((s) => s.id === slotId);
    const out: Record<string, Viability> = {};
    if (!slot) return out;
    for (const word of words) {
      if (word.length !== slot.cells.length) {
        out[word] = "nogood";
        continue;
      }
      const trial = cloneGrid(grid);
      const current = slotText(grid, slot);
      if ([...current].some((ch, i) => ch !== "." && ch !== word[i])) {
        out[word] = "nogood";
        continue;
      }
      slot.cells.forEach((cell, i) => (trial.cells[cell] = word[i]));
      const res = this.fill(trial, rules, { timeoutMs });
      out[word] = res.ok ? "good" : res.reason === "timeout" ? "unknown" : "nogood";
    }
    return out;
  }
}
