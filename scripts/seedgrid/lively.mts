/**
 * Grows scripts/seedgrid/wordlists/lively.dict: the multi-word phrases and
 * modern vocabulary that make a fill feel alive (HATTIP, TRIVIANIGHT,
 * LETTHEMCOOK), which single-word dictionaries lack. Claude proposes entries
 * by category; existing lines are never overwritten, so hand edits stick.
 *
 *   pnpm seedgrid:lively                 # every category
 *   pnpm seedgrid:lively "board games"   # one category, any topic
 *
 * Tiers: "clean" → 55 (everyday phrase), "spice" → 49 (pop culture, slang,
 * names; in only when the required score is 49).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatDict, normalizeEntry, parseDict, type DictEntry } from "../../src/lib/seedgrid/dictionary";
import { callJson, usage } from "./claude.mts";

const CATEGORIES = [
  "everyday verb phrases (rats out, hat tip, sit tight, cash in)",
  "idioms and conversational phrases (no big deal, my bad, fair enough)",
  "food, drinks, and cooking",
  "technology, the internet, and apps",
  "games: video games, board games, card games, tabletop",
  "music, movies, and TV (titles, genres, well-known artists)",
  "sports and fitness",
  "science, nature, and space",
  "school, work, and money",
  "places, landmarks, and travel",
  "modern slang and memes (still widely understood)",
  "home, family, and daily life",
];

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, "wordlists/lively.dict");

interface Proposal {
  entry: string;
  tier: "clean" | "spice";
  proper: boolean;
  abbreviation: boolean;
  slang: boolean;
}

async function propose(category: string): Promise<Proposal[]> {
  const { entries } = await callJson<{ entries: Proposal[] }>({
    system:
      "You are a veteran American crossword constructor building a word list. You know what makes fill lively: in-the-language phrases, fresh vocabulary, and names most solvers know. You avoid crosswordese, partials, obscure abbreviations, and anything offensive.",
    prompt: `Propose about 120 lively crossword entries in this category: ${category}.

Rules:
- Each entry must be a real, commonly used word, phrase, title, or name, written normally ("hat tip", "Bon Iver").
- 5 to 13 letters once spaces and punctuation are removed; favor 6–11 letter multi-word phrases.
- No digits. No entries that only make sense with punctuation.
- tier "clean": a typical adult solver would know it instantly. tier "spice": fun but narrower (pop culture, slang, niche names).
- Mark proper nouns, abbreviations, and slang.`,
    schema: {
      type: "object",
      properties: {
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entry: { type: "string" },
              tier: { type: "string", enum: ["clean", "spice"] },
              proper: { type: "boolean" },
              abbreviation: { type: "boolean" },
              slang: { type: "boolean" },
            },
            required: ["entry", "tier", "proper", "abbreviation", "slang"],
          },
        },
      },
      required: ["entries"],
    },
    maxTokens: 12000,
  });
  return entries;
}

const categories = process.argv[2] ? [process.argv[2]] : CATEGORIES;
const existing = fs.existsSync(file) ? parseDict(fs.readFileSync(file, "utf8")) : [];
const known = new Set(existing.map((e) => e.word));
const results = await Promise.all(categories.map(propose));

const added: DictEntry[] = [];
for (const p of results.flat()) {
  const word = normalizeEntry(p.entry);
  if (word.length < 3 || word.length > 15 || known.has(word)) continue;
  known.add(word);
  const tags = `${p.proper ? "p" : ""}${p.abbreviation ? "a" : ""}${p.slang ? "s" : ""}`;
  added.push({ word, score: p.tier === "clean" && !p.abbreviation ? 55 : 49, tags });
}

fs.writeFileSync(file, formatDict([...existing, ...added]));
console.log(`+${added.length} entries (${existing.length + added.length} total) → ${path.relative(process.cwd(), file)}`);
console.log(`tokens: ${usage.input} in / ${usage.output} out`);
