/**
 * Word-list scoring rules shared by the dictionary build (scripts/seedgrid/build-dict.mts).
 *
 * Frequency lists count single words, so they can only judge single words.
 * Phrases stored without spaces (GOATCHEESE, BELTANDBRACES) are naturally
 * rare as tokens and often the liveliest fill, so frequency never touches them.
 */

/** Fewest-parts split of an entry into vocabulary words, or null if it can't be split. */
export function splitWords(entry: string, vocab: Set<string>, maxPart = 20): string[] | null {
  const best: (string[] | null)[] = Array(entry.length + 1).fill(null);
  best[0] = [];
  for (let i = 1; i <= entry.length; i++) {
    for (let j = Math.max(0, i - maxPart); j < i; j++) {
      const prev = best[j];
      const part = entry.slice(j, i);
      if (prev && vocab.has(part) && (!best[i] || prev.length + 1 < best[i]!.length)) best[i] = [...prev, part];
    }
  }
  return best[entry.length];
}

export type EntryKind = "word" | "phrase" | "other";

/**
 * "word": a dictionary word or a common token. Rarer tokens don't count, since
 * subtitle frequency lists also contain run-together phrases (GOODAFTERNOON).
 * "phrase": splits into two or more vocabulary words. "other": names, brands, letter combos.
 */
export function entryKind(entry: string, dictionary: Set<string>, rank: Map<string, number>, vocab: Set<string>): EntryKind {
  if (dictionary.has(entry) || (rank.get(entry) ?? Infinity) < 100_000) return "word";
  return (splitWords(entry, vocab)?.length ?? 0) >= 2 ? "phrase" : "other";
}

const INFLECTIONS = ["S", "ES", "ED", "D", "ING", "ER", "ERS", "LY"];

/** Frequency rank of the word, or of the word it inflects if that is more common. */
function lemmaRank(word: string, rank: Map<string, number>): number {
  let best = rank.get(word) ?? Infinity;
  for (const suf of INFLECTIONS) {
    if (word.length - suf.length >= 3 && word.endsWith(suf)) best = Math.min(best, rank.get(word.slice(0, -suf.length)) ?? Infinity);
  }
  return best;
}

/**
 * The highest score a single word may keep, given how common it is. Common words
 * (top 50k) are uncapped; 50k–200k cap at 60; rarer words cap at 45, below the
 * usual 50 floor, so they appear only when a grid needs them. An inflection of
 * a common word (PURLOINS) caps at 55 instead.
 */
export function frequencyCap(word: string, rank: Map<string, number>): number {
  const r = rank.get(word) ?? Infinity;
  if (r < 50_000) return 100;
  if (r < 200_000) return 60;
  return lemmaRank(word, rank) < 50_000 ? 55 : 45;
}
