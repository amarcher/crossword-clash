/**
 * Constraint-satisfaction fill engine.
 *
 * Each open slot keeps a bitset "domain" of the dictionary words that still
 * fit it. Crossing slots constrain each other letter by letter (arc
 * consistency), the search always branches on the slot with the fewest
 * options left (MRV), and every pair of entries is kept free of duplicates
 * and long shared letter runs.
 *
 * Slots whose squares are all lettered (theme entries, hand-typed words) are
 * fixed and need not be in the dictionary.
 */
import { bitIndices, intersects, popcount, popcount32, type Bits, type LengthBucket, type WordIndex } from "./dictionary";
import { cloneGrid, crossingsOf, slotsOf, slotText, type Crossing, type Grid, type Slot } from "./grid";

export interface FillOptions {
  /** Longest run of letters two entries may share (Ingrid's "longest shared sequence"). Default 4. */
  maxShared?: number;
  /** Slot id → the only words allowed there (the curator's approvals). */
  approved?: Record<string, string[]>;
  timeMs?: number;
  /** Search steps before giving up on this attempt. */
  maxSteps?: number;
  /** Candidates tried per branch, best first. */
  branch?: number;
  /** Score noise added when ordering candidates, so repeated fills differ. */
  jitter?: number;
  random?: () => number;
}

export interface Candidate {
  word: string;
  score: number;
  tags: string;
  /** Fewest options this word leaves any crossing slot. */
  crossOptions: number;
  /** Word score plus a bonus for leaving the crossings room. */
  recommended: number;
}

/** Shared letter runs longer than `maxShared`, or one entry inside another. */
export function conflicts(a: string, b: string, maxShared: number): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 4 && long.includes(short)) return true;
  const n = maxShared + 1;
  for (let i = 0; i + n <= short.length; i++) if (long.includes(short.slice(i, i + n))) return true;
  return false;
}

class Abort extends Error {}

export class FillEngine {
  readonly slots: Slot[];
  readonly crossings: Crossing[][];
  private readonly buckets: (LengthBucket | undefined)[];
  /** Fixed words (fully lettered slots), or null for open slots. */
  readonly fixed: (string | null)[];
  private readonly base: (Bits | null)[];
  private readonly opts: Required<Omit<FillOptions, "approved">>;
  private steps = 0;
  private deadline = 0;
  readonly grid: Grid;

  constructor(grid: Grid, index: WordIndex, options: FillOptions = {}) {
    this.grid = grid;
    this.opts = {
      maxShared: options.maxShared ?? 4,
      timeMs: options.timeMs ?? 10_000,
      maxSteps: options.maxSteps ?? 200_000,
      branch: options.branch ?? 24,
      jitter: options.jitter ?? 6,
      random: options.random ?? Math.random,
    };
    this.slots = slotsOf(grid);
    this.crossings = crossingsOf(this.slots);
    this.buckets = this.slots.map((s) => index.bucket(s.cells.length));
    this.fixed = this.slots.map((s) => {
      const text = slotText(grid, s);
      return text.includes(".") ? null : text;
    });
    this.base = this.slots.map((s, si) => {
      if (this.fixed[si] !== null) return null;
      const b = this.buckets[si];
      if (!b) return new Uint32Array(0);
      const dom = b.all.slice();
      s.cells.forEach((cell, pos) => {
        const ch = grid.cells[cell];
        if (!ch) return;
        const mask = b.posLetter[pos * 26 + ch.charCodeAt(0) - 65];
        for (let i = 0; i < dom.length; i++) dom[i] &= mask[i];
      });
      const allowed = options.approved?.[s.id];
      if (allowed) {
        const keep = new Uint32Array(dom.length);
        for (const w of allowed) {
          const wi = b.lookup.get(w);
          if (wi !== undefined) keep[wi >>> 5] |= 1 << (wi & 31);
        }
        for (let i = 0; i < dom.length; i++) dom[i] &= keep[i];
      }
      return dom;
    });
  }

  slotIndex(id: string): number {
    return this.slots.findIndex((s) => s.id === id);
  }

  // ---- Arc consistency ----

  private letterMask(si: number, dom: Bits, pos: number): number {
    const b = this.buckets[si];
    if (!b) return 0; // no words of this length
    let mask = 0;
    for (let l = 0; l < 26; l++) if (intersects(dom, b.posLetter[pos * 26 + l])) mask |= 1 << l;
    return mask;
  }

  /** Narrows `dom` to words with a letter from `mask` at `pos`. Returns whether it changed. */
  private restrict(si: number, dom: Bits, pos: number, mask: number): boolean {
    const b = this.buckets[si];
    if (!b) return false;
    const allowed = new Uint32Array(dom.length);
    for (let l = 0; l < 26; l++) {
      if (!(mask & (1 << l))) continue;
      const bits = b.posLetter[pos * 26 + l];
      for (let i = 0; i < allowed.length; i++) allowed[i] |= bits[i];
    }
    let changed = false;
    for (let i = 0; i < dom.length; i++) {
      const next = (dom[i] & allowed[i]) >>> 0;
      if (next !== dom[i]) {
        dom[i] = next;
        changed = true;
      }
    }
    return changed;
  }

  private propagate(doms: (Bits | null)[], queue: number[]): boolean {
    const queued = new Set(queue);
    while (queue.length) {
      const si = queue.shift()!;
      queued.delete(si);
      const dom = doms[si];
      if (!dom) continue;
      for (const c of this.crossings[si]) {
        const other = doms[c.other];
        if (!other) continue;
        const mask = this.letterMask(si, dom, c.pos);
        if (this.restrict(c.other, other, c.otherPos, mask)) {
          if (!other.some((v) => v !== 0)) return false;
          if (!queued.has(c.other)) {
            queued.add(c.other);
            queue.push(c.other);
          }
        }
      }
    }
    return true;
  }

  private wordOf(si: number, doms: (Bits | null)[]): string | null {
    if (this.fixed[si] !== null) return this.fixed[si];
    const dom = doms[si]!;
    if (popcount(dom) !== 1) return null;
    return this.buckets[si]!.words[bitIndices(dom).next().value as number];
  }

  /**
   * Propagates, then enforces no-duplicates among decided entries: a decided
   * word is struck from every other domain, which can decide more slots.
   */
  private settle(doms: (Bits | null)[], queue: number[]): boolean {
    if (!this.propagate(doms, queue)) return false;
    const struck = new Set<string>();
    for (;;) {
      const decided: { si: number; word: string }[] = [];
      this.slots.forEach((_, si) => {
        const w = this.wordOf(si, doms);
        if (w) decided.push({ si, word: w });
      });
      for (let i = 0; i < decided.length; i++) {
        for (let j = i + 1; j < decided.length; j++) {
          const a = decided[i];
          const b = decided[j];
          if (this.fixed[a.si] !== null && this.fixed[b.si] !== null) continue;
          if (conflicts(a.word, b.word, this.opts.maxShared)) return false;
        }
      }
      const next: number[] = [];
      for (const { si: from, word } of decided) {
        if (struck.has(word)) continue;
        struck.add(word);
        doms.forEach((dom, si) => {
          if (!dom || si === from || this.slots[si].cells.length !== word.length) return;
          const wi = this.buckets[si]!.lookup.get(word);
          if (wi === undefined || !(dom[wi >>> 5] & (1 << (wi & 31)))) return;
          dom[wi >>> 5] &= ~(1 << (wi & 31));
          if (!dom.some((v) => v !== 0)) next.push(-1);
          next.push(si);
        });
      }
      if (next.includes(-1)) return false;
      if (!next.length) return true;
      if (!this.propagate(doms, next)) return false;
    }
  }

  /** Domains after full propagation, or null when the grid as it stands cannot be filled. */
  consistentDomains(): (Bits | null)[] | null {
    const doms = this.base.map((d) => d && d.slice());
    if (doms.some((d) => d && !d.some((v) => v !== 0))) return null;
    return this.settle(doms, doms.map((_, i) => i)) ? doms : null;
  }

  /**
   * The constraint heatmap: for each slot, how many words fit its pattern and
   * leave every crossing at least one option (a one-step lookahead, so a dead
   * end shows up where it is rather than wiping the whole grid). Fixed slots
   * count as 1.
   */
  slotOptions(): number[] {
    return this.base.map((dom, si) => {
      if (!dom) return 1;
      const d = dom.slice();
      for (const c of this.crossings[si]) {
        const other = this.base[c.other];
        if (!other) continue;
        this.restrict(si, d, c.pos, this.letterMask(c.other, other, c.otherPos));
      }
      return popcount(d);
    });
  }

  /** Per cell, the option count of its tighter slot (black cells: -1). */
  cellOptions(): number[] {
    const counts = this.slotOptions();
    const out = this.grid.cells.map((c) => (c === "#" ? -1 : Infinity));
    this.slots.forEach((s, si) => s.cells.forEach((cell) => (out[cell] = Math.min(out[cell], counts[si]))));
    return out.map((v) => (v === Infinity ? 0 : v));
  }

  /** Viable words for a slot, best first. */
  candidates(slotId: string, limit = 25, sortBy: "recommended" | "score" = "recommended"): Candidate[] {
    const si = this.slotIndex(slotId);
    if (si < 0 || this.fixed[si] !== null) return [];
    const doms = this.consistentDomains() ?? this.base.map((d) => d && d.slice());
    const dom = doms[si]!;
    const b = this.buckets[si];
    if (!b) return [];
    // Scores are sorted descending within a bucket, so the first indices are the best-scored.
    const pool = [...bitIndices(dom)].slice(0, Math.max(limit * 12, 300));
    const out = pool.map((wi) => {
      const word = b.words[wi];
      let crossOptions = Infinity;
      for (const c of this.crossings[si]) {
        const other = doms[c.other];
        if (!other) continue;
        const ob = this.buckets[c.other]!;
        const bits = ob.posLetter[c.otherPos * 26 + word.charCodeAt(c.pos) - 65];
        let n = 0;
        for (let i = 0; i < other.length; i++) {
          const v = other[i] & bits[i];
          if (v) n += popcount32(v);
        }
        crossOptions = Math.min(crossOptions, n);
      }
      if (crossOptions === Infinity) crossOptions = 999;
      return {
        word,
        score: b.scores[wi],
        tags: b.tags[wi],
        crossOptions,
        recommended: b.scores[wi] + 6 * Math.log2(1 + Math.min(crossOptions, 200)),
      };
    });
    const viable = out.filter((c) => c.crossOptions > 0);
    viable.sort((x, y) => (sortBy === "score" ? y.score - x.score : y.recommended - x.recommended) || (x.word < y.word ? -1 : 1));
    return viable.slice(0, limit);
  }

  // ---- Search ----

  private pickSlot(doms: (Bits | null)[]): number {
    let best = -1;
    let bestCount = Infinity;
    doms.forEach((dom, si) => {
      if (!dom) return;
      const n = popcount(dom);
      if (n <= 1) return;
      // Fewest options first; among ties, the longer slot constrains more.
      const key = n - this.slots[si].cells.length / 100;
      if (key < bestCount) {
        bestCount = key;
        best = si;
      }
    });
    return best;
  }

  private search(doms: (Bits | null)[]): (Bits | null)[] | null {
    if (++this.steps > this.opts.maxSteps || ((this.steps & 63) === 0 && Date.now() > this.deadline)) throw new Abort();
    const si = this.pickSlot(doms);
    if (si < 0) return doms;
    const b = this.buckets[si]!;
    const order = [...bitIndices(doms[si]!)]
      .map((wi) => ({ wi, key: b.scores[wi] + this.opts.random() * this.opts.jitter }))
      .sort((x, y) => y.key - x.key)
      .slice(0, this.opts.branch);
    for (const { wi } of order) {
      const next = doms.map((d) => d && d.slice());
      const only = new Uint32Array(next[si]!.length);
      only[wi >>> 5] = 1 << (wi & 31);
      next[si] = only;
      if (!this.settle(next, [si])) continue;
      const done = this.search(next);
      if (done) return done;
    }
    return null;
  }

  /**
   * Fills every open square, keeping what is already in the grid. Restarts
   * with fresh randomness until the step or time budget runs out. Returns
   * null if no fill was found.
   */
  fill(): Grid | null {
    const start = Date.now();
    const deadline = start + this.opts.timeMs;
    const initial = this.consistentDomains();
    if (!initial) return null;
    const perAttempt = Math.max(2_000, Math.floor(this.opts.maxSteps / 8));
    while (Date.now() < deadline) {
      this.steps = 0;
      this.deadline = deadline;
      const budget = this.opts.maxSteps;
      this.opts.maxSteps = perAttempt;
      try {
        const doms = this.search(initial.map((d) => d && d.slice()));
        // A miss within the branch limit is not proof of impossibility: restart.
        if (doms) return this.apply(doms);
      } catch (e) {
        if (!(e instanceof Abort)) throw e;
      } finally {
        this.opts.maxSteps = budget;
      }
    }
    return null;
  }

  private apply(doms: (Bits | null)[]): Grid {
    const out = cloneGrid(this.grid);
    this.slots.forEach((s, si) => {
      const w = this.wordOf(si, doms);
      if (w) s.cells.forEach((cell, pos) => (out.cells[cell] = w[pos]));
    });
    return out;
  }
}
