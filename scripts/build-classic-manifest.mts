/**
 * Rebuilds public/classic-puzzles/manifest.json from the .puz files next to it.
 *
 *   pnpm build:classics
 *
 * Source: "The Cross Word Puzzle Book" (Buranelli, Hartswick, Petherbridge —
 * Plaza Publishing, 1924; the first crossword book ever published). Public
 * domain in the US (pre-1929). Project Gutenberg #68267; .puz conversions by
 * crosserville.com/CrossWordPuzzleBook (contributor DuronHalix), which the
 * numbering in the filenames (cwpb<N>) follows.
 *
 * Four of the book's fifty puzzles are deliberately not shipped: #21 and #34
 * (racial slurs in clues/answers), #40 (Klan-joke pseudonym), #42 (swastika
 * grid). Add a file here and the manifest picks it up; delete one and it drops.
 *
 * Each entry carries the puzzle's `identity` (the same `puzzleIdentity()` the
 * solo timer keys best times by), so the library screen can show "solved" and
 * personal bests without parsing 46 files client-side.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@xwordly/xword-parser";
import { normalizePuzzle } from "../src/lib/puzzleNormalizer";
import { puzzleIdentity } from "../src/lib/soloStats";
import type { ClassicEntry } from "../src/lib/classicLibrary";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/classic-puzzles");
const files = fs.readdirSync(dir).filter((f) => /^cwpb\d+\.puz$/.test(f));

/** The editors' one-line 1924 blurb, trimmed to its first sentence or two. */
function blurbFrom(notes: string): string {
  const flat = notes.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const sentences = flat.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [flat];
  let out = "";
  for (const s of sentences) {
    if (out && (out + s).length > 140) break;
    out += s;
  }
  return out.trim();
}

const entries: ClassicEntry[] = files
  .map((file) => {
    const number = Number(file.match(/\d+/)![0]);
    const raw = parse(fs.readFileSync(path.join(dir, file)), { filename: file });
    const puzzle = normalizePuzzle(raw, "puzzle.puz");
    const notes = typeof (raw as { notes?: unknown }).notes === "string" ? (raw as { notes: string }).notes : "";
    return {
      file,
      number,
      title: puzzle.title,
      author: puzzle.author,
      width: puzzle.width,
      height: puzzle.height,
      clues: puzzle.clues.length,
      identity: puzzleIdentity(puzzle),
      blurb: blurbFrom(notes),
    };
  })
  .sort((a, b) => a.number - b.number);

const out = path.join(dir, "manifest.json");
fs.writeFileSync(out, JSON.stringify(entries, null, 1) + "\n");
console.log(`Wrote ${entries.length} entries to ${path.relative(process.cwd(), out)}`);
