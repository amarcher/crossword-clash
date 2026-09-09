import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parse } from "@xwordly/xword-parser";
import {
  filterEntries,
  isClassicEntry,
  parseManifest,
  pickRandom,
  sizeBucket,
  type ClassicEntry,
} from "./classicLibrary";
import { normalizePuzzle } from "./puzzleNormalizer";
import { puzzleIdentity } from "./soloStats";

const entry = (over: Partial<ClassicEntry> = {}): ClassicEntry => ({
  file: "cwpb1.puz",
  number: 1,
  title: "A Soft Beginning",
  author: "Gregorian",
  width: 11,
  height: 11,
  clues: 50,
  identity: "id1",
  blurb: "",
  ...over,
});

describe("sizeBucket", () => {
  it("buckets by the longer side", () => {
    expect(sizeBucket({ width: 11, height: 11 })).toBe("small");
    expect(sizeBucket({ width: 13, height: 13 })).toBe("small");
    expect(sizeBucket({ width: 15, height: 13 })).toBe("medium");
    expect(sizeBucket({ width: 15, height: 15 })).toBe("medium");
    expect(sizeBucket({ width: 17, height: 15 })).toBe("large");
    expect(sizeBucket({ width: 19, height: 19 })).toBe("large");
    expect(sizeBucket({ width: 21, height: 19 })).toBe("giant");
    expect(sizeBucket({ width: 23, height: 23 })).toBe("giant");
  });
});

describe("isClassicEntry / parseManifest", () => {
  it("accepts a complete entry and rejects partial or wrong-typed ones", () => {
    expect(isClassicEntry(entry())).toBe(true);
    expect(isClassicEntry({ ...entry(), identity: 7 })).toBe(false);
    expect(isClassicEntry({ file: "x.puz", title: "t", size: "11x11" })).toBe(false); // legacy shape
    expect(isClassicEntry(null)).toBe(false);
  });

  it("drops junk rows and sorts by book number", () => {
    const out = parseManifest([entry({ number: 9 }), "junk", entry({ number: 2 }), { file: 1 }]);
    expect(out.map((e) => e.number)).toEqual([2, 9]);
  });

  it("returns [] for a non-array", () => {
    expect(parseManifest({})).toEqual([]);
    expect(parseManifest(null)).toEqual([]);
  });
});

describe("filterEntries", () => {
  const list = [
    entry({ number: 1, width: 11, height: 11, identity: "a" }),
    entry({ number: 2, width: 15, height: 15, identity: "b" }),
    entry({ number: 3, width: 19, height: 19, identity: "c" }),
  ];

  it("returns everything for 'all' with no solved filter", () => {
    expect(filterEntries(list, { bucket: "all" })).toHaveLength(3);
  });

  it("filters by bucket", () => {
    expect(filterEntries(list, { bucket: "medium" }).map((e) => e.number)).toEqual([2]);
    expect(filterEntries(list, { bucket: "giant" })).toEqual([]);
  });

  it("hides solved only when asked", () => {
    const solved = new Set(["b"]);
    expect(filterEntries(list, { bucket: "all", solved }).map((e) => e.number)).toEqual([1, 2, 3]);
    expect(
      filterEntries(list, { bucket: "all", solved, hideSolved: true }).map((e) => e.number),
    ).toEqual([1, 3]);
  });
});

describe("pickRandom", () => {
  const list = [entry({ identity: "a" }), entry({ identity: "b" }), entry({ identity: "c" })];

  it("prefers unsolved entries", () => {
    const solved = new Set(["a", "b"]);
    expect(pickRandom(list, solved, () => 0)?.identity).toBe("c");
    expect(pickRandom(list, solved, () => 0.99)?.identity).toBe("c");
  });

  it("falls back to the whole list when everything is solved", () => {
    const solved = new Set(["a", "b", "c"]);
    expect(pickRandom(list, solved, () => 0.5)?.identity).toBe("b");
  });

  it("returns null for an empty list", () => {
    expect(pickRandom([], new Set())).toBeNull();
  });
});

/**
 * Integrity of the shipped asset: every manifest row points at a real .puz
 * that parses, and the precomputed identity matches what the solo timer
 * would compute at runtime — otherwise "solved" badges silently never show.
 * Regenerate with `pnpm build:classics` if this fails after adding puzzles.
 */
describe("public/classic-puzzles/manifest.json", () => {
  const dir = decodeURIComponent(new URL("../../public/classic-puzzles/", import.meta.url).pathname);
  const readText = (file: string) => new TextDecoder().decode(readFileSync(dir + file));
  const raw = JSON.parse(readText("manifest.json")) as unknown[];
  const manifest = parseManifest(raw);

  it("is non-empty and every row validates", () => {
    expect(manifest.length).toBeGreaterThan(0);
    expect(manifest.length).toBe(raw.length);
  });

  it("has unique files, numbers and identities", () => {
    expect(new Set(manifest.map((e) => e.file)).size).toBe(manifest.length);
    expect(new Set(manifest.map((e) => e.number)).size).toBe(manifest.length);
    expect(new Set(manifest.map((e) => e.identity)).size).toBe(manifest.length);
  });

  it("matches every .puz on disk (and nothing on disk is missing from it)", () => {
    const onDisk = readdirSync(dir).filter((f) => f.endsWith(".puz")).sort();
    expect(manifest.map((e) => e.file).sort()).toEqual(onDisk);
  });

  it("every entry's dimensions, clue count and identity match the parsed file", () => {
    for (const e of manifest) {
      const puzzle = normalizePuzzle(parse(readFileSync(dir + e.file), { filename: e.file }), "puzzle.puz");
      expect({ file: e.file, w: puzzle.width, h: puzzle.height, clues: puzzle.clues.length, id: puzzleIdentity(puzzle) })
        .toEqual({ file: e.file, w: e.width, h: e.height, clues: e.clues, id: e.identity });
      expect(puzzle.title).toBe(e.title);
    }
  });
});
