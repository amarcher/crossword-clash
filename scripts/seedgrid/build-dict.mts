/**
 * Builds the base word list, scripts/seedgrid/wordlists/base.dict, from two
 * public sources (download them first; see scripts/mini-generator/README.md):
 *
 *   ENABLE (public domain)         — is it a real word?
 *   FrequencyWords en_full (MIT)   — how everyday is it? (falls back to en_50k)
 *   Collaborative Word List (MIT)  — constructor-scored phrases and names, which
 *                                    give long slots enough options to fill
 *                                    (Crossword Nexus; optional but recommended)
 *
 *   pnpm seedgrid:dict
 *
 * Scores use the Collaborative Word List's 0–100 scale with the "49 vs 50"
 * convention: 50 and up is fill a grid may use freely; below 50 only when a grid
 * will not fill otherwise (as a constructor lowers Ingrid's required score).
 * Frequency can only lower a single word's score (see src/lib/seedgrid/scoring.ts);
 * phrases keep theirs. lively.dict adds phrases and rescore.dict overrides all.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatDict, parseDict, type DictEntry } from "../../src/lib/seedgrid/dictionary";
import { entryKind, frequencyCap, levelCap, levelScore, SCOWL_LEVELS, type EntryKind } from "../../src/lib/seedgrid/scoring";

const here = path.dirname(fileURLToPath(import.meta.url));
const sources = path.resolve(here, "../mini-generator/wordlists");
const read = (name: string) => {
  const file = path.join(sources, name);
  if (!fs.existsSync(file) && name === "en_full.txt") return read("freq50k.txt");
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file}. Download it with the commands in scripts/mini-generator/README.md.`);
    process.exit(1);
  }
  return fs.readFileSync(file, "utf8").split("\n").map((w) => w.trim().split(" ")[0].toLowerCase()).filter(Boolean);
};

const enable = read("enable1.txt");
const rank = new Map<string, number>();
read("en_full.txt").forEach((w, i) => {
  if (!rank.has(w)) rank.set(w, i);
});

function score(word: string): number {
  const r = rank.get(word);
  if (r === undefined) return 35;
  if (r < 2_000) return 60;
  if (r < 8_000) return 57;
  if (r < 20_000) return 54;
  if (r < 35_000) return 52;
  if (r < 50_000) return 50;
  if (r < 100_000) return 47;
  if (r < 200_000) return 44;
  return 35;
}

const fromEnable: DictEntry[] = enable
  .filter((w) => /^[a-z]{3,15}$/.test(w))
  .map((w) => ({ word: w.toUpperCase(), score: score(w), tags: "" }));

// Its 50 tier is a catch-all (ADHESIVEMIRROR, ANTEXCUSEFORAPARTY), so those
// entries drop to 47: available when a grid needs them, never preferred.
const cwlFile = path.join(sources, "xwordlist.dict");
const fromCwl: DictEntry[] = fs.existsSync(cwlFile)
  ? parseDict(
      fs
        .readFileSync(cwlFile, "utf8")
        .split("\n")
        // Normalizing drops digits, which turns MP3JS into a fake "MPJS" (and 7ELEVEN into
        // ELEVEN), so entries spelled with numerals are left out.
        .filter((line) => !/\d/.test(line.split(";")[0]))
        .join("\n"),
    )
      .filter((e) => e.word.length <= 15)
      .map((e) => ({ ...e, score: e.score === 50 ? 47 : e.score }))
  : [];
if (!fromCwl.length) console.warn("No xwordlist.dict: long slots will be hard to fill (see scripts/mini-generator/README.md).");
// The Collaborative Word List's scores are the scale. Frequency can only lower a
// single word's score (OXLIP, REATTEMPTED); phrases stored without spaces are
// naturally rare as tokens, so they keep their score. ENABLE fills in words the
// list lacks, scored by frequency.
// Plain a–z tokens only: uppercasing ligatures ("baﬄed" → "BAFFLED") would let a rare
// spelling overwrite the common word's rank.
const RANK = new Map([...rank].filter(([w]) => /^[a-z]+$/.test(w)).map(([w, r]) => [w.toUpperCase(), r]));
const DICTIONARY = new Set(enable.map((w) => w.toUpperCase()));
const VOCAB = new Set([...DICTIONARY, ...[...RANK].filter(([, r]) => r < 100_000).map(([w]) => w)].filter((w) => w.length >= 2 && /^[A-Z]+$/.test(w)));
VOCAB.add("A").add("I");
const best = new Map<string, DictEntry>(fromEnable.map((e) => [e.word, e]));
const report = { word: 0, phrase: 0, other: 0, capped: 0 } as Record<EntryKind | "capped", number>;
const demoted: string[] = [];
for (const e of fromCwl) {
  const kind = entryKind(e.word, DICTIONARY, RANK, VOCAB);
  report[kind]++;
  const score = kind === "word" ? Math.min(e.score, frequencyCap(e.word, RANK)) : e.score;
  if (score < e.score) {
    report.capped++;
    if (e.score >= 75 && demoted.length < 30 && report.capped % 97 === 0) demoted.push(`${e.word} ${e.score}→${score}`);
  }
  best.set(e.word, { ...e, score });
}
console.log(`Collaborative Word List: ${report.word} words, ${report.phrase} phrases, ${report.other} other; ${report.capped} rare words capped by frequency`);
console.log(`  e.g. ${demoted.slice(0, 12).join(", ")}`);
const entries = [...best.values()];
const blockFile = path.join(sources, "blocklist-en.txt");
const blocked = fs.existsSync(blockFile)
  ? read("blocklist-en.txt").map((w) => w.toUpperCase().replace(/[^A-Z]/g, "")).filter((w) => w.length >= 3)
  : [];
if (!blocked.length) console.warn("No blocklist-en.txt: offensive words are not filtered (see scripts/mini-generator/README.md).");
const blockedSet = new Set(blocked);
const SUFFIXES = ["", "S", "ES", "ED", "D", "ING", "Y", "ER", "ERS", "IER", "IEST"];
const isBlocked = (word: string) =>
  SUFFIXES.some((suf) => word.endsWith(suf) && blockedSet.has(word.slice(0, word.length - suf.length)));
const lively = fs.existsSync(path.join(here, "wordlists/lively.dict"))
  ? fs.readFileSync(path.join(here, "wordlists/lively.dict"), "utf8").split("\n").map((l) => l.split(";")[0])
  : [];
const blockedEntries = [...new Set([...blocked, ...entries.map((e) => e.word), ...lively].filter(isBlocked))].map((word) => ({ word, score: 0, tags: "" }));
fs.writeFileSync(path.join(here, "wordlists/blocked.dict"), formatDict(blockedEntries));
console.log(`${blockedEntries.length} offensive entries → scripts/seedgrid/wordlists/blocked.dict`);

const out = path.join(here, "wordlists/base.dict");
fs.writeFileSync(out, formatDict(entries));
const clean = entries.filter((e) => e.score >= 50).length;
console.log(`${entries.length} words (${clean} scored 50+; ${fromCwl.length} from the Collaborative Word List) → ${path.relative(process.cwd(), out)}`);

// ---- production.dict: only sources whose licenses allow shipping the list ----
// The Collaborative Word List (MIT), ENABLE (public domain), and SCOWL levels up
// to 70 (Kevin Atkinson's permissive license; level 80+ adds UKACD) for how common
// a word is. FrequencyWords is share-alike, so it plays no part here; the
// offensive-words list only removes entries (blocked.dict) and is never shipped.
const scowlDir = path.join(sources, "scowl/final");
if (!fs.existsSync(scowlDir)) {
  console.warn("No SCOWL in scripts/mini-generator/wordlists/scowl: skipping production.dict (see scripts/mini-generator/README.md).");
} else {
  const LEVELS = new Map<string, number>();
  for (const level of SCOWL_LEVELS) {
    for (const prefix of ["english-words", "american-words"]) {
      const file = path.join(scowlDir, `${prefix}.${level}`);
      if (!fs.existsSync(file)) continue;
      // SCOWL is ISO-8859-1; plain a-z words only (no accents, apostrophes or capitals).
      for (const raw of fs.readFileSync(file, "latin1").split("\n")) {
        const w = raw.trim();
        if (/^[a-z]+$/.test(w)) {
          const word = w.toUpperCase();
          if (!LEVELS.has(word)) LEVELS.set(word, level);
        }
      }
    }
  }
  const SINGLE = new Set([...DICTIONARY, ...LEVELS.keys()]);
  const PROD_VOCAB = new Set([...SINGLE].filter((w) => w.length >= 2)).add("A").add("I");
  const prod = new Map<string, DictEntry>(
    enable.filter((w) => /^[a-z]{3,15}$/.test(w)).map((w) => [w.toUpperCase(), { word: w.toUpperCase(), score: levelScore(w.toUpperCase(), LEVELS), tags: "" }]),
  );
  let capped = 0;
  for (const e of fromCwl) {
    const kind = entryKind(e.word, SINGLE, new Map(), PROD_VOCAB);
    const score = kind === "word" ? Math.min(e.score, levelCap(e.word, LEVELS)) : e.score;
    if (score < e.score) capped++;
    prod.set(e.word, { ...e, score });
  }
  const prodEntries = [...prod.values()];
  fs.writeFileSync(path.join(here, "wordlists/production.dict"), formatDict(prodEntries));
  console.log(
    `${prodEntries.length} words (${prodEntries.filter((e) => e.score >= 50).length} scored 50+; ${capped} rare words capped by SCOWL level) → scripts/seedgrid/wordlists/production.dict`,
  );
}
