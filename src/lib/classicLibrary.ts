/**
 * The bundled public-domain "classic" library: 46 puzzles from the 1924
 * *Cross Word Puzzle Book* (the first crossword book ever published), shipped
 * as static .puz files under /classic-puzzles with a generated manifest
 * (`pnpm build:classics` → scripts/build-classic-manifest.mts).
 *
 * Pure helpers live here so the library screen and the import hub share one
 * loader, and so sizing/grouping logic is unit-testable without the DOM.
 */
import { parse } from "@xwordly/xword-parser";
import { normalizePuzzle } from "./puzzleNormalizer";
import { track } from "./analytics";
import type { Puzzle } from "../types/puzzle";

/** One entry in /classic-puzzles/manifest.json (generated — do not hand-edit). */
export interface ClassicEntry {
  /** Filename under /classic-puzzles/, e.g. "cwpb7.puz". */
  file: string;
  /** The puzzle's number in the 1924 book (1–50; four are not shipped). */
  number: number;
  title: string;
  author: string;
  width: number;
  height: number;
  /** Total clue count (across + down). */
  clues: number;
  /** `puzzleIdentity()` of the normalized puzzle — the solo best-time key. */
  identity: string;
  /** The 1924 editors' note on the puzzle, trimmed. May be empty. */
  blurb: string;
}

export const CLASSIC_MANIFEST_URL = "/classic-puzzles/manifest.json";

/** Coarse size buckets for the library filter. Keyed by the longer side. */
export type SizeBucket = "small" | "medium" | "large" | "giant";
export const SIZE_BUCKETS: readonly SizeBucket[] = ["small", "medium", "large", "giant"];

export function sizeBucket(entry: Pick<ClassicEntry, "width" | "height">): SizeBucket {
  const side = Math.max(entry.width, entry.height);
  if (side <= 13) return "small";
  if (side <= 15) return "medium";
  if (side <= 19) return "large";
  return "giant";
}

export function isClassicEntry(value: unknown): value is ClassicEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.file === "string" &&
    typeof e.number === "number" &&
    typeof e.title === "string" &&
    typeof e.author === "string" &&
    typeof e.width === "number" &&
    typeof e.height === "number" &&
    typeof e.clues === "number" &&
    typeof e.identity === "string" &&
    typeof e.blurb === "string"
  );
}

/** Keep only well-formed entries, in book order. Tolerates junk in the file. */
export function parseManifest(data: unknown): ClassicEntry[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isClassicEntry).sort((a, b) => a.number - b.number);
}

/**
 * Fetch + validate the manifest. Resolves to `[]` on any failure so callers
 * can simply hide the section — the library is a bonus, never a blocker.
 */
export async function loadClassicManifest(): Promise<ClassicEntry[]> {
  try {
    const res = await fetch(CLASSIC_MANIFEST_URL);
    if (!res.ok) return [];
    return parseManifest(await res.json());
  } catch {
    return [];
  }
}

/** Fetch, parse and normalize one classic; reports the import to analytics. */
export async function loadClassicPuzzle(entry: Pick<ClassicEntry, "file" | "title">): Promise<Puzzle> {
  const res = await fetch(`/classic-puzzles/${entry.file}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  const parsed = parse(buffer, { filename: entry.file });
  const puzzle = normalizePuzzle(parsed, "puzzle.puz");
  track("puzzle_imported", {
    source: "classic",
    title: puzzle.title || entry.title,
    size: `${puzzle.width}x${puzzle.height}`,
  });
  return puzzle;
}

/**
 * Filter for the library screen: an optional size bucket, and optionally hide
 * puzzles the player has already solved (keyed by identity).
 */
export function filterEntries(
  entries: readonly ClassicEntry[],
  opts: { bucket?: SizeBucket | "all"; hideSolved?: boolean; solved?: ReadonlySet<string> },
): ClassicEntry[] {
  const bucket = opts.bucket ?? "all";
  const solved = opts.solved ?? new Set<string>();
  return entries.filter(
    (e) =>
      (bucket === "all" || sizeBucket(e) === bucket) &&
      !(opts.hideSolved && solved.has(e.identity)),
  );
}

/**
 * Pick a random entry, preferring unsolved ones. Deterministic given `rand`
 * (defaults to Math.random) so tests can pin the choice.
 */
export function pickRandom(
  entries: readonly ClassicEntry[],
  solved: ReadonlySet<string> = new Set(),
  rand: () => number = Math.random,
): ClassicEntry | null {
  if (entries.length === 0) return null;
  const pool = entries.filter((e) => !solved.has(e.identity));
  const from = pool.length > 0 ? pool : entries;
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))];
}
