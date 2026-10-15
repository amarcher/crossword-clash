import { describe, it, expect } from "vitest";
import { parse } from "@xwordly/xword-parser";
import { normalizePuzzle } from "../puzzleNormalizer";
import { WordIndex, parseDict, mergeDicts, normalizeEntry } from "./dictionary";
import { gridFromRows, gridToRows, gridStats, slotsOf, slotText, partners, emptyGrid } from "./grid";
import { FillEngine, conflicts } from "./solver";
import { buildSkeleton, placeSeed, placeSeeds, shapeSkeleton, mirrorPlacement } from "./layout";
import { auditGrid, auditClues, clueGivesAway } from "./audit";
import { toIpuz, SPEED_CLUES_KEY } from "./ipuz";
import { entryKind, frequencyCap, splitWords } from "./scoring";

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// BAT/ORE/WED across, BOW/ARE/TED down is one fill; the rest are decoys.
const DICT = parseDict(`
BAT;60
ORE;55
WED;55
BOW;60
ARE;60
TED;50;p
CAT;60
OAR;55
ZZZ;60
EEL;40
`);

describe("dictionary", () => {
  it("parses WORD;SCORE;tags and normalizes phrases", () => {
    const d = parseDict("Hat tip;55;\nbad;line\nDTF;30;a\n# comment\nNOSCORE\n");
    expect(d).toEqual([
      { word: "HATTIP", score: 55, tags: "" },
      { word: "DTF", score: 30, tags: "a" },
      { word: "NOSCORE", score: 50, tags: "" },
    ]);
    expect(normalizeEntry("let them cook!")).toBe("LETTHEMCOOK");
  });

  it("later lists rescore earlier ones", () => {
    const merged = mergeDicts(parseDict("YEET;30"), parseDict("YEET;49;s"));
    expect(merged).toEqual([{ word: "YEET", score: 49, tags: "s" }]);
  });

  it("drops words under the required score and matches patterns", () => {
    const index = new WordIndex(DICT, 50);
    expect(index.match("B.T")).toEqual(["BAT"]);
    expect(index.match("..E").sort()).toEqual(["ARE", "ORE"]);
    expect(index.entry("EEL")).toBeUndefined();
    expect(new WordIndex(DICT, 50, ["BAT"]).match("B.T")).toEqual([]);
  });
});

describe("grid", () => {
  it("numbers slots the standard way and reports stats", () => {
    const g = gridFromRows(["#....", ".....", ".....", ".....", "....#"]);
    const ids = slotsOf(g).map((s) => s.id);
    expect(ids.slice(0, 6)).toEqual(["1A", "1D", "2D", "3D", "4D", "5A"]);
    const stats = gridStats(g);
    expect(stats.words).toBe(10);
    expect(stats.shortRuns).toBe(0);
    expect(stats.avgLength).toBeCloseTo(4.6);
  });

  it("flags short runs", () => {
    expect(gridStats(gridFromRows(["..#..", ".....", ".....", ".....", "....."])).shortRuns).toBeGreaterThan(0);
  });

  it("maps symmetric partners", () => {
    const g = emptyGrid(5);
    expect(partners(g, 0, "rotational")).toEqual([0, 24]);
    expect(partners(g, 1, "mirror")).toEqual([1, 3]);
    expect(partners(g, 1, "diagonal")).toEqual([1, 5]);
    expect(partners(g, 12, "rotational")).toEqual([12]);
    expect(partners(g, 3, "none")).toEqual([3]);
  });
});

describe("conflicts", () => {
  it("blocks repeats, containment, and long shared runs", () => {
    expect(conflicts("NEON", "NEONS", 4)).toBe(true);
    expect(conflicts("STAR", "STARFISH", 4)).toBe(true);
    expect(conflicts("HERMITCRAB", "TAXIDERMIST", 4)).toBe(false); // shares ERMI: 4 is allowed
    expect(conflicts("HERMITCRAB", "THERMIT", 4)).toBe(true); // HERMIT
    expect(conflicts("ATE", "LATER", 4)).toBe(false); // 3-letter containment is incidental
    expect(conflicts("NATION", "MOTION", 3)).toBe(true);
  });
});

describe("FillEngine", () => {
  const index = new WordIndex(DICT, 50);

  it("fills an open grid with distinct dictionary words", () => {
    const filled = new FillEngine(gridFromRows(["...", "...", "..."]), index, { random: rng(1) }).fill();
    expect(filled).not.toBeNull();
    const answers = slotsOf(filled!).map((s) => slotText(filled!, s));
    expect(new Set(answers).size).toBe(6);
    for (const a of answers) expect(index.entry(a)).toBeDefined();
  });

  it("keeps locked letters and accepts theme words missing from the list", () => {
    const g = gridFromRows(["BAT", "...", "..."]);
    const filled = new FillEngine(g, index, { random: rng(2) }).fill();
    expect(gridToRows(filled!)[0]).toBe("BAT");
    const odd = gridFromRows(["QQQ#", "....", "....", "...."]);
    expect(new FillEngine(odd, index).fixed[0]).toBe("QQQ");
  });

  it("honors approvals and reports dead ends", () => {
    const engine = new FillEngine(gridFromRows(["...", "...", "..."]), index, { approved: { "1A": ["CAT"] } });
    expect(engine.fill()).toBeNull(); // no down word starts with C
    expect(new FillEngine(gridFromRows(["Q..", "...", "..."]), index).cellOptions()[0]).toBe(0);
    const open = new FillEngine(gridFromRows(["...", "...", "..."]), index);
    const top = open.candidates("1A");
    expect(top.map((c) => c.word)).toContain("BAT");
    expect(top.map((c) => c.word)).not.toContain("OAR"); // no down word starts with R
    expect(top.every((c) => c.crossOptions > 0)).toBe(true);
  });

  it("settles when bitset blocks use the top bit (more than 31 words of a length)", () => {
    // Regression: a signed/unsigned compare made propagation loop forever.
    const words = Array.from({ length: 26 * 3 }, (_, i) => String.fromCharCode(65 + (i % 26)) + "A" + String.fromCharCode(65 + Math.floor(i / 26)));
    const big = new WordIndex(parseDict([...words, ...DICT.map((e) => e.word)].map((w) => `${w};60`).join("\n")), 50);
    const filled = new FillEngine(gridFromRows(["...", "...", "..."]), big, { random: rng(3), timeMs: 2000 }).fill();
    expect(filled).not.toBeNull();
  });

  it("refuses a fill that needs a duplicate", () => {
    // Only a symmetric word square would fit, so across = down.
    const square = new WordIndex(parseDict("CAT;60\nARE;60\nTEN;60"), 50);
    expect(new FillEngine(gridFromRows(["...", "...", "..."]), square, { timeMs: 200 }).fill()).toBeNull();
  });
});

describe("layout", () => {
  it("places and locks a seed with blacks at both ends, mirrored", () => {
    const g = emptyGrid(7);
    expect(placeSeed(g, { word: "STAR", dir: "across", row: 0, col: 1 }, "rotational")).toBe(true);
    expect(gridToRows(g)[0]).toBe("#STAR#.");
    expect(gridToRows(g)[6]).toBe(".#....#");
    expect(g.locked.slice(1, 5)).toEqual([true, true, true, true]);
  });

  it("keeps parallel seeds three rows apart and prefers mirrored pairs", () => {
    let mirrored = 0;
    for (let i = 0; i < 20; i++) {
      const placed = placeSeeds({ size: 9, symmetry: "rotational", seeds: ["STARFISH", "DEVILRAY"], random: rng(i) });
      if (!placed) continue;
      const [a, b] = placed.placements;
      if (a.dir === b.dir) expect(Math.abs(a.dir === "across" ? a.row - b.row : a.col - b.col)).toBeGreaterThanOrEqual(3);
      const m = mirrorPlacement(a, 9, "rotational");
      if (m && m.dir === b.dir && m.row === b.row && m.col === b.col) mirrored++;
    }
    expect(mirrored).toBeGreaterThan(0);
  });

  it("shapes a seeded grid by adding blacks where the heatmap is worst", () => {
    const words = ["STAR", "SEAT", "TEAS", "EATS", "RATE", "TEAR", "ARTS", "RATS", "STAT", "TARS", "ARES", "EAST", "SATE", "ETAS", "SEAR", "ERAS", "RASE", "TSAR", "STARE", "TEARS", "RATES", "ASTER", "TASTE", "STATE", "TREAT", "TERSE", "RESET", "STEER", "TREES", "ESTER"];
    const index = new WordIndex(parseDict(words.map((w) => `${w};60`).join("\n")), 50);
    const start = gridFromRows([".....", ".....", ".....", ".....", "....."]);
    const shaped = shapeSkeleton(start, index, { symmetry: "rotational", random: rng(1), maxBlockPct: 0.3 });
    if (shaped) {
      expect(gridStats(shaped).shortRuns).toBe(0);
      expect(new FillEngine(shaped, index).consistentDomains()).not.toBeNull();
    }
  });

  it("builds a legal skeleton around seeds", () => {
    const random = rng(7);
    let skeleton = null;
    for (let i = 0; i < 50 && !skeleton; i++) {
      skeleton = buildSkeleton({ size: 9, symmetry: "rotational", seeds: ["STARFISH", "DEVILRAY"], random });
    }
    expect(skeleton).not.toBeNull();
    const stats = gridStats(skeleton!.grid);
    expect(stats.shortRuns).toBe(0);
    expect(stats.connected).toBe(true);
    expect(stats.blockPct).toBeLessThanOrEqual(0.22);
    const answers = slotsOf(skeleton!.grid).map((s) => slotText(skeleton!.grid, s));
    expect(answers).toContain("STARFISH");
    expect(answers).toContain("DEVILRAY");
  });
});

describe("audit", () => {
  it("finds duplicates and niche crossings", () => {
    const index = new WordIndex(parseDict("NEON;55\nNEONS;55\nTED;49;p\nBAT;60"), 0);
    const g = gridFromRows(["NEON#", "#####", "NEONS"]);
    const report = auditGrid(g, index);
    expect(report.issues.some((i) => i.kind === "duplicate" && i.severity === "block")).toBe(true);
  });

  it("checks clue length and give-aways", () => {
    expect(clueGivesAway("A hat tip, so to speak", "HATTIP")).toBe(true);
    expect(clueGivesAway("Sea temperature", "ATE")).toBe(false);
    const issues = auditClues([
      { slotId: "1A", answer: "BAT", clue: "x".repeat(42) },
      { slotId: "2A", answer: "ORE", clue: "Rock with ore in it" },
    ]);
    expect(issues.map((i) => i.kind)).toEqual(["clue-length", "clue-answer", "clue-budget"]);
  });
});

describe("ipuz", () => {
  it("round-trips through the importer", () => {
    const g = gridFromRows(["BAT", "ORE", "WED"]);
    const clues = {
      "1A": { standard: "Cricket gear", speed: "Club for baseball" },
      "1D": { standard: "Archer's weapon" },
    };
    const ipuz = toIpuz(g, clues, { title: "Tiny", author: "Crossword Clash", theme: "Test" });
    expect(ipuz[SPEED_CLUES_KEY].Across[0]).toEqual([1, "Club for baseball"]);
    const raw = parse(JSON.stringify(ipuz), { filename: "tiny.ipuz" });
    const puzzle = normalizePuzzle(raw as Parameters<typeof normalizePuzzle>[0], "tiny.ipuz");
    expect(puzzle.title).toBe("Tiny");
    expect(puzzle.width).toBe(3);
    const across = puzzle.clues.filter((c) => c.direction === "across");
    expect(across[0]).toMatchObject({ number: 1, text: "Cricket gear", answer: "BAT" });
  });
});

describe("word-list scoring", () => {
  const vocab = new Set(["GOAT", "CHEESE", "BELT", "AND", "BRACES", "CAR", "PET", "CARPET"]);
  const dictionary = new Set(["CARPET", "OXLIP", "PURLOIN", "PURLOINS"]);
  const rank = new Map([["CARPET", 9_000], ["PURLOIN", 30_000], ["GOODAFTERNOON", 250_000], ["OREO", 60_000]]);

  it("splits run-together phrases into the fewest words", () => {
    expect(splitWords("GOATCHEESE", vocab)).toEqual(["GOAT", "CHEESE"]);
    expect(splitWords("BELTANDBRACES", vocab)).toEqual(["BELT", "AND", "BRACES"]);
    expect(splitWords("CARPET", vocab)).toEqual(["CARPET"]);
    expect(splitWords("XAXIS", vocab)).toBeNull();
  });

  it("only dictionary words and common tokens count as single words", () => {
    expect(entryKind("CARPET", dictionary, rank, vocab)).toBe("word");
    expect(entryKind("OREO", dictionary, rank, vocab)).toBe("word");
    expect(entryKind("GOATCHEESE", dictionary, rank, vocab)).toBe("phrase");
    // A rare run-together token in the frequency list is still a phrase, not a word.
    expect(entryKind("GOODAFTERNOON", dictionary, rank, new Set([...vocab, "GOOD", "AFTERNOON"]))).toBe("phrase");
    expect(entryKind("XAXIS", dictionary, rank, vocab)).toBe("other");
  });

  it("caps rare single words and spares inflections of common ones", () => {
    expect(frequencyCap("CARPET", rank)).toBe(100);
    expect(frequencyCap("OREO", rank)).toBe(60);
    expect(frequencyCap("OXLIP", rank)).toBe(45);
    expect(frequencyCap("PURLOINS", rank)).toBe(55);
  });
});
