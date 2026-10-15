/**
 * Scored word lists in the `WORD;SCORE` format crossword constructors use
 * (Crossfire, Ingrid, Spread the Word(list)), with an optional third field of
 * tags: `p` proper noun, `a` abbreviation, `s` slang/pop culture.
 *
 * Score tiers (the "49 vs 50" convention): 50+ is clean everyday fill, 49 is
 * the opt-in spice tier, below 49 is crosswordese that a `minScore` of 49 or
 * 50 leaves out entirely.
 */

export interface DictEntry {
  word: string;
  score: number;
  tags: string;
}

/** Strips everything but letters and uppercases: "Hat tip" → "HATTIP". */
export function normalizeEntry(text: string): string {
  return text.toUpperCase().replace(/[^A-Z]/g, "");
}

export function parseDict(text: string): DictEntry[] {
  const out: DictEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [rawWord, rawScore, tags = ""] = trimmed.split(";");
    const word = normalizeEntry(rawWord);
    const score = rawScore === undefined ? 50 : Number(rawScore);
    if (word.length < 3 || !Number.isFinite(score)) continue;
    out.push({ word, score, tags: tags.trim() });
  }
  return out;
}

/** Later lists override earlier ones for the same word (rescoring). */
export function mergeDicts(...lists: DictEntry[][]): DictEntry[] {
  const byWord = new Map<string, DictEntry>();
  for (const list of lists) for (const e of list) byWord.set(e.word, e);
  return [...byWord.values()];
}

export function formatDict(entries: DictEntry[]): string {
  return entries.map((e) => (e.tags ? `${e.word};${e.score};${e.tags}` : `${e.word};${e.score}`)).join("\n") + "\n";
}

// ---- Bitsets over the words of one length ----

export type Bits = Uint32Array;

export function popcount32(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24);
}

export function popcount(bits: Bits): number {
  let n = 0;
  for (let i = 0; i < bits.length; i++) if (bits[i]) n += popcount32(bits[i]);
  return n;
}

export function intersects(a: Bits, b: Bits): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] & b[i]) return true;
  return false;
}

export function* bitIndices(bits: Bits): Generator<number> {
  for (let i = 0; i < bits.length; i++) {
    let v = bits[i];
    while (v) {
      const low = v & -v;
      yield i * 32 + (31 - Math.clz32(low));
      v ^= low;
    }
  }
}

export interface LengthBucket {
  len: number;
  words: string[];
  scores: number[];
  tags: string[];
  /** Index of each word in `words`. */
  lookup: Map<string, number>;
  /** `posLetter[pos * 26 + letter]`: the words with that letter at that position. */
  posLetter: Bits[];
  all: Bits;
}

const A = 65;

/**
 * Words grouped by length with a bitset per (position, letter), so that
 * "which words fit S?A?E" is a handful of ANDs instead of a scan.
 */
export class WordIndex {
  private buckets = new Map<number, LengthBucket>();

  constructor(entries: DictEntry[], minScore: number, rejected: Iterable<string> = []) {
    const banned = new Set(rejected);
    const grouped = new Map<number, DictEntry[]>();
    for (const e of entries) {
      if (e.score < minScore || banned.has(e.word)) continue;
      const list = grouped.get(e.word.length) ?? [];
      list.push(e);
      grouped.set(e.word.length, list);
    }
    for (const [len, list] of grouped) {
      list.sort((a, b) => b.score - a.score || (a.word < b.word ? -1 : 1));
      const blocks = Math.ceil(list.length / 32);
      const posLetter = Array.from({ length: len * 26 }, () => new Uint32Array(blocks));
      const all = new Uint32Array(blocks);
      list.forEach((e, i) => {
        all[i >>> 5] |= 1 << (i & 31);
        for (let p = 0; p < len; p++) posLetter[p * 26 + e.word.charCodeAt(p) - A][i >>> 5] |= 1 << (i & 31);
      });
      this.buckets.set(len, {
        len,
        words: list.map((e) => e.word),
        scores: list.map((e) => e.score),
        tags: list.map((e) => e.tags),
        lookup: new Map(list.map((e, i) => [e.word, i])),
        posLetter,
        all,
      });
    }
  }

  bucket(len: number): LengthBucket | undefined {
    return this.buckets.get(len);
  }

  entry(word: string): DictEntry | undefined {
    const b = this.buckets.get(word.length);
    const i = b?.lookup.get(word);
    return b && i !== undefined ? { word, score: b.scores[i], tags: b.tags[i] } : undefined;
  }

  /** Words matching a pattern where "." or " " is an open square: "S.A.E". */
  match(pattern: string): string[] {
    const b = this.buckets.get(pattern.length);
    if (!b) return [];
    const bits = b.all.slice();
    for (let p = 0; p < pattern.length; p++) {
      const code = pattern.charCodeAt(p) - A;
      if (code < 0 || code > 25) continue;
      const mask = b.posLetter[p * 26 + code];
      for (let i = 0; i < bits.length; i++) bits[i] &= mask[i];
    }
    return [...bitIndices(bits)].map((i) => b.words[i]);
  }
}
