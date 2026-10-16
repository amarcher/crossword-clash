/**
 * Pure helpers for `pnpm seedgrid:large` (scripts/seedgrid/large.mts): the
 * themer validator and the fill scorer. No engine, no I/O, so they are unit
 * tested here and the CLI stays a thin orchestration layer.
 */
import { normalizeEntry } from "./dictionary";

export const DEFAULT_LARGE_SIZE = 15;

/** The longest run of letters two entries have in common ("GOAL" for GOALPOSTMALONE / GOALLINEDANCE). */
export function longestSharedRun(a: string, b: string): string {
  let best = "";
  for (let i = 0; i < a.length; i++) {
    for (let j = i + best.length + 1; j <= a.length; j++) {
      const sub = a.slice(i, j);
      if (b.includes(sub)) best = sub;
      else break;
    }
  }
  return best;
}

export interface SharedRun {
  a: string;
  b: string;
  run: string;
}

/** Every pair of entries sharing a run longer than `maxShared`, or one inside the other. */
export function sharedRuns(entries: string[], maxShared: number): SharedRun[] {
  const out: SharedRun[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const run = longestSharedRun(entries[i], entries[j]);
      if (run.length > maxShared) out.push({ a: entries[i], b: entries[j], run });
    }
  }
  return out;
}

export interface SeedPairing {
  /** Same-length seeds that mirror each other under rotational symmetry. */
  pairs: [string, string][];
  /** The one odd-length seed that sits on the center row, if any. */
  center: string | null;
}

export type SeedValidation =
  | { ok: true; seeds: string[]; pairing: SeedPairing; warnings: string[] }
  | { ok: false; seeds: string[]; errors: string[] };

export interface SeedOptions {
  size?: number;
  /** Longest run two entries may share (the engine's MAX_SHARED). */
  maxShared?: number;
  /** Report shared runs between themers as warnings instead of errors. */
  allowShared?: boolean;
}

/**
 * Normalizes the themers and checks they can be laid out in a rotationally
 * symmetric grid: same-length pairs, plus at most one centered odd entry.
 */
export function validateSeeds(raw: string[], opts: SeedOptions = {}): SeedValidation {
  const size = opts.size ?? DEFAULT_LARGE_SIZE;
  const maxShared = opts.maxShared ?? 3;
  const seeds = raw.map(normalizeEntry).filter(Boolean);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!seeds.length) errors.push("No theme entries given.");
  const dupes = seeds.filter((s, i) => seeds.indexOf(s) !== i);
  if (dupes.length) errors.push(`Duplicate theme entries: ${[...new Set(dupes)].join(", ")}.`);
  for (const s of seeds) {
    if (s.length < 3) errors.push(`${s} is too short (3 letters minimum).`);
    if (s.length > size) errors.push(`${s} is ${s.length} letters; a ${size}×${size} grid holds ${size}.`);
  }

  const byLength = new Map<number, string[]>();
  for (const s of seeds) byLength.set(s.length, [...(byLength.get(s.length) ?? []), s]);
  const pairs: [string, string][] = [];
  const leftovers: string[] = [];
  for (const [, group] of [...byLength.entries()].sort((a, b) => b[0] - a[0])) {
    for (let i = 0; i + 1 < group.length; i += 2) pairs.push([group[i], group[i + 1]]);
    if (group.length % 2) leftovers.push(group[group.length - 1]);
  }
  let center: string | null = null;
  if (leftovers.length > 1) {
    errors.push(
      `Lengths must pair under rotational symmetry: ${leftovers.map((s) => `${s} (${s.length})`).join(", ")} have no partner of the same length, and only one entry can sit alone on the center row.`,
    );
  } else if (leftovers.length === 1) {
    const [lone] = leftovers;
    if ((size - lone.length) % 2) {
      errors.push(`${lone} (${lone.length}) has no partner of the same length and cannot be centered in a ${size}×${size} grid (it needs an ${size % 2 ? "odd" : "even"} length).`);
    } else center = lone;
  }

  const shared = sharedRuns(seeds, maxShared);
  for (const s of shared) {
    const msg = `${s.a} and ${s.b} share ${s.run} (${s.run.length} letters; the limit is ${maxShared}).`;
    if (opts.allowShared) warnings.push(msg);
    else errors.push(`${msg} Pass --allow-shared to keep them.`);
  }

  if (errors.length) return { ok: false, seeds, errors };
  return { ok: true, seeds, pairing: { pairs, center }, warnings };
}

// ---- Fill scoring ----

/** Short function words; an entry made only of these (ASDOI, ORISIT) is a partial. */
export const FUNCTION_WORDS = new Set([
  "A", "AN", "THE", "AS", "AT", "OF", "OR", "TO", "IN", "ON", "IS", "IT", "I", "DO", "SO", "BE", "AM", "NO", "ME", "MY", "WE", "HE",
  "UP", "BY", "IF", "AND", "FOR", "ARE", "ITS", "HIS", "HER", "YOU", "ONE", "NOT", "BUT", "CAN", "HAD", "HAS", "WAS", "DID", "ALL", "ANY",
]);

function splitsIntoFunctionWords(entry: string): boolean {
  const best: number[] = Array(entry.length + 1).fill(Infinity);
  best[0] = 0;
  for (let i = 1; i <= entry.length; i++) {
    for (let j = Math.max(0, i - 3); j < i; j++) {
      if (best[j] < Infinity && FUNCTION_WORDS.has(entry.slice(j, i))) best[i] = Math.min(best[i], best[j] + 1);
    }
  }
  return best[entry.length] >= 2 && best[entry.length] < Infinity;
}

/**
 * Entries that read as a fragment of a longer phrase: all function words
 * (ASDOI, ORISIT), or an article glued to a word (ATUNING, ANOTE, THEEND).
 * A heuristic for ranking, not a ban: it also reads AMANDA and ATONE as
 * article + word, so `scoreFill` skips it for entries the list scores
 * PARTIAL_EXEMPT_SCORE or higher, and `singleWords` (ENABLE) exempts real
 * words when a caller has that list.
 */
export function looksPartial(entry: string, vocab: Set<string>, singleWords?: Set<string>): boolean {
  if (entry.length < 4) return false;
  if (singleWords?.has(entry)) return false;
  if (splitsIntoFunctionWords(entry)) return true;
  for (const article of ["A", "AN", "THE"]) {
    const rest = entry.slice(article.length);
    if (entry.startsWith(article) && rest.length >= (article === "THE" ? 3 : 4) && vocab.has(rest)) return true;
  }
  return false;
}

export interface FillEntry {
  slotId: string;
  answer: string;
  locked: boolean;
}

export interface Nesting {
  /** The engine-filled entry that sits inside another. */
  inner: FillEntry;
  host: FillEntry;
}

/**
 * Engine-filled entries that appear inside another entry (SCALE in UPSCALE):
 * a duplicate an editor would reject. A contained entry no longer than
 * `maxShared` (RON in IRON, OWN in TOUCHDOWNUNDER) is a shared run the
 * rule allows, so it is not reported.
 */
export function nestedEntries(entries: FillEntry[], maxShared = 3): Nesting[] {
  const out: Nesting[] = [];
  for (const inner of entries) {
    if (inner.locked || inner.answer.length <= maxShared) continue;
    const host = entries.find((o) => o.answer !== inner.answer && o.answer.includes(inner.answer));
    if (host) out.push({ inner, host });
  }
  return out;
}

export interface ScoreContext {
  /** Word → list score. */
  scores: Map<string, number>;
  /** Hard rejections: a fill containing one is thrown out. */
  ban: Set<string>;
  /** Theme-adjacent entries worth a bonus (theme-bonus/<slug>.dict). */
  bonus?: Set<string>;
  /** Words the list considers clean (score ≥ the floor); used by the partial heuristic. */
  vocab?: Set<string>;
  /** Real single words, if available, to exempt from the partial heuristic. */
  singleWords?: Set<string>;
  /** The score tier below which an entry counts as weak (default 50). */
  cleanScore?: number;
  /** Longest run two entries may share (default 3); a contained entry this short is allowed. */
  maxShared?: number;
}

export interface WeakEntry {
  slotId: string;
  answer: string;
  score: number;
  reasons: string[];
}

export interface FillScore {
  /** Higher is better; comparable between fills of the same skeleton. */
  total: number;
  /** Engine-filled entries scored; `total / count` compares fills of different skeletons. */
  count: number;
  /** Mean list score of the engine-filled entries. */
  mean: number;
  banned: string[];
  partials: string[];
  bonusHits: string[];
  /** Entries below the clean tier, partials and bans, worst first. */
  weak: WeakEntry[];
}

export const PARTIAL_PENALTY = 8;
export const BONUS_POINTS = 10;
export const DUPLICATE_PENALTY = 15;
export const SUBTIER_PENALTY = 10;
/** Entries the list scores this high are not second-guessed by the partial heuristic. */
export const PARTIAL_EXEMPT_SCORE = 60;
/** Scores above this add nothing more: lively fill helps, but cannot pay for junk elsewhere. */
export const SCORE_CEILING = 70;

/**
 * Scores one fill by word quality. Each engine-filled entry contributes its
 * distance from the clean tier, capped at SCORE_CEILING; an entry below the
 * tier loses that distance again plus a flat SUBTIER_PENALTY, so a 45 costs
 * 20 and no number of 100-point phrases hides a pile of them. Partial-looking
 * entries (unless the list scores them PARTIAL_EXEMPT_SCORE+) and entries of
 * 4+ letters nested inside another entry (`nestedEntries`) lose points; theme-bonus words
 * gain them. A banned word is reported, and the caller must reject the fill.
 */
export function scoreFill(entries: FillEntry[], ctx: ScoreContext): FillScore {
  const clean = ctx.cleanScore ?? 50;
  const vocab = ctx.vocab ?? new Set([...ctx.scores.entries()].filter(([, s]) => s >= clean).map(([w]) => w));
  let total = 0;
  let sum = 0;
  let n = 0;
  const banned: string[] = [];
  const partials: string[] = [];
  const bonusHits: string[] = [];
  const weak: WeakEntry[] = [];
  const nested = new Map(nestedEntries(entries, ctx.maxShared ?? 3).map((n) => [n.inner.answer, n.host.answer]));
  for (const e of entries) {
    if (e.locked) continue;
    const score = ctx.scores.get(e.answer) ?? 0;
    const reasons: string[] = [];
    n++;
    sum += score;
    total += Math.min(score, SCORE_CEILING) - clean;
    if (score < clean) {
      total -= clean - score + SUBTIER_PENALTY;
      reasons.push(`scored ${score}`);
    }
    if (ctx.ban.has(e.answer)) {
      banned.push(e.answer);
      reasons.push("banned");
    }
    if (score < PARTIAL_EXEMPT_SCORE && looksPartial(e.answer, vocab, ctx.singleWords)) {
      partials.push(e.answer);
      total -= PARTIAL_PENALTY;
      reasons.push("partial-looking");
    }
    const host = nested.get(e.answer);
    if (host) {
      total -= DUPLICATE_PENALTY;
      reasons.push(`inside ${host}`);
    }
    if (ctx.bonus?.has(e.answer)) {
      bonusHits.push(e.answer);
      total += BONUS_POINTS;
    }
    if (reasons.length) weak.push({ slotId: e.slotId, answer: e.answer, score, reasons });
  }
  weak.sort((a, b) => Number(b.reasons.includes("banned")) - Number(a.reasons.includes("banned")) || a.score - b.score);
  return { total, count: n, mean: n ? sum / n : 0, banned, partials, bonusHits, weak };
}

/** Parses a ban/bonus list: one entry per line, `;score` and `#` comments ignored. */
export function parseWordSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const word = normalizeEntry(trimmed.split(";")[0]);
    if (word.length >= 3) out.add(word);
  }
  return out;
}

/** "Football x music" → "football-x-music", the folder and theme-bonus file name. */
export function themeSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
