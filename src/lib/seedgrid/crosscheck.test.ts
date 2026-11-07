import { describe, expect, it } from "vitest";
import type { TransferPuzzle } from "../puzzleNormalizer";
import {
  CLUE_REPEAT_DAYS,
  clueIssues,
  clueKey,
  clueUses,
  crosscheckDay,
  dayRange,
  daysBetween,
  entriesFromRows,
  entriesFromTransfer,
  recentCluesFor,
  repeatedClues,
  repeatProblem,
  rowsFromTransfer,
  sharedEntries,
  stripClueNumber,
  titleAsEntry,
  type ClueUse,
} from "./crosscheck";

/** A 5×5 with a black corner pair, as the feed stores it (flat grid, "." black). */
function transfer(overrides: Partial<TransferPuzzle> = {}): TransferPuzzle {
  const rows = ["#TAPE", "AREAS", "BIDET", "UTAH#", "TSKS#"];
  return {
    title: "Tape Deck",
    author: "Test",
    size: { rows: 5, cols: 5 },
    grid: rows.join("").split("").map((c) => (c === "#" ? "." : c)),
    gridnums: [],
    clues: { across: ["1. Sticky roll", "5. Regions", "6. Bathroom fixture", "7. Beehive State", "8. Disapproving clicks"], down: ["1. ___ and bolts", "2. Stadium", "3. Zip", "4. Sweet and ___", "5. Little rascal"] },
    answers: { across: ["TAPE", "AREAS", "BIDET", "UTAH", "TSKS"], down: ["ABUT", "TRITS", "AEDAK", "PAEHS", "EST"] },
    ...overrides,
  };
}

describe("entriesFromRows", () => {
  it("lists every across run then every down run of 3+ letters, in grid order", () => {
    expect(entriesFromRows(["#TAPE", "AREAS", "BIDET", "UTAH#", "TSKS#"])).toEqual([
      "TAPE", "AREAS", "BIDET", "UTAH", "TSKS",
      "ABUT", "TRITS", "AEDAK", "PAEHS", "EST",
    ]);
  });

  it("accepts '.' as black, upper-cases, and drops runs shorter than the minimum", () => {
    expect(entriesFromRows(["ab.", "cd.", "..e"])).toEqual([]);
    expect(entriesFromRows(["abc", "...", "..."])).toEqual(["ABC"]);
    expect(entriesFromRows(["ab#", "cd#", "###"], 2)).toEqual(["AB", "CD", "AC", "BD"]);
  });

  it("handles an empty grid", () => {
    expect(entriesFromRows([])).toEqual([]);
  });
});

describe("rowsFromTransfer / entriesFromTransfer", () => {
  it("rebuilds rows from the flat feed grid and reads its entries", () => {
    const p = transfer();
    expect(rowsFromTransfer(p)).toEqual(["#TAPE", "AREAS", "BIDET", "UTAH#", "TSKS#"]);
    expect(entriesFromTransfer(p)).toContain("TAPE");
    expect(entriesFromTransfer(p)).toContain("ABUT");
  });
});

describe("sharedEntries", () => {
  it("reports entries of 4+ letters in both lists once each, in the first list's order", () => {
    expect(sharedEntries(["TAPE", "UTAH", "EST", "TAPE", "DEER"], ["deer", "UTAH", "EST", "tape"])).toEqual(["TAPE", "UTAH", "DEER"]);
  });

  it("ignores three-letter glue unless asked for it", () => {
    expect(sharedEntries(["EST", "ORE"], ["EST", "ORE"])).toEqual([]);
    expect(sharedEntries(["EST", "ORE"], ["EST", "ORE"], 3)).toEqual(["EST", "ORE"]);
  });
});

describe("titleAsEntry / stripClueNumber", () => {
  it("squashes a title to letters", () => {
    expect(titleAsEntry("Sunken Treasure")).toBe("SUNKENTREASURE");
    expect(titleAsEntry("Ta-da!")).toBe("TADA");
  });

  it("drops the feed's clue number prefix only", () => {
    expect(stripClueNumber("12. Clue text")).toBe("Clue text");
    expect(stripClueNumber("3) Clue")).toBe("Clue");
    expect(stripClueNumber("No number here")).toBe("No number here");
    expect(stripClueNumber("1. 2 for the price of 1")).toBe("2 for the price of 1");
  });
});

describe("clueIssues", () => {
  it("is empty for a clean puzzle", () => {
    expect(clueIssues(transfer())).toEqual([]);
  });

  it("flags empty clues, clues over the length limit, and clues that contain their answer", () => {
    const p = transfer({
      clues: {
        across: ["1. ", "5. " + "x".repeat(42), "6. A bidet, basically", "7. Beehive State", "8. Disapproving clicks"],
        down: ["1. ___ and bolts", "2. Stadium", "3. Zip", "4. Sweet and ___", "5. Little rascal"],
      },
    });
    expect(clueIssues(p).map((i) => `${i.dir} ${i.index + 1} ${i.answer} ${i.problem}`)).toEqual([
      "across 1 TAPE empty",
      "across 2 AREAS too long",
      "across 3 BIDET gives away answer",
    ]);
  });

  it("measures length without the number prefix", () => {
    const p = transfer({ clues: { across: ["1. " + "y".repeat(41), "5. a", "6. b", "7. c", "8. d"], down: ["1. a", "2. b", "3. c", "4. d", "5. e"] } });
    expect(clueIssues(p)).toEqual([]);
  });
});

describe("crosscheckDay", () => {
  it("is clean for one puzzle with no issues", () => {
    const report = crosscheckDay("2026-11-01", [{ slot: "mini", puzzle: transfer() }]);
    expect(report.problems).toEqual([]);
    expect(report.present).toEqual([{ slot: "mini", title: "Tape Deck", size: "5×5", entries: 10 }]);
  });

  it("reports a title that is an entry, clue issues, and entries shared between the day's puzzles", () => {
    const mini = transfer({ title: "Bidet" });
    const midi = transfer({ title: "Also", clues: { across: ["1. ", "5. b", "6. c", "7. d", "8. e"], down: ["1. a", "2. b", "3. c", "4. d", "5. e"] } });
    const report = crosscheckDay("2026-11-01", [
      { slot: "mini", puzzle: mini },
      { slot: "midi", puzzle: midi },
    ]);
    expect(report.problems).toEqual([
      'mini: title "Bidet" is an entry',
      "midi: across clue 1 for TAPE empty",
      "mini/midi share TAPE, AREAS, BIDET, UTAH, TSKS, ABUT, TRITS, AEDAK, PAEHS",
    ]);
  });

  it("checks every pair of slots", () => {
    const report = crosscheckDay("d", [
      { slot: "mini", puzzle: transfer() },
      { slot: "midi", puzzle: transfer({ grid: "..........ABCDE..........".split(""), answers: { across: [], down: [] }, clues: { across: [], down: [] }, title: "" }) },
      { slot: "large", puzzle: transfer({ grid: "..........ABCDE..........".split(""), answers: { across: [], down: [] }, clues: { across: [], down: [] }, title: "" }) },
    ]);
    expect(report.problems).toEqual(["midi/large share ABCDE"]);
  });
});

describe("dayRange", () => {
  it("lists every day inclusive, across a month boundary", () => {
    expect(dayRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(dayRange("2026-11-02", "2026-11-02")).toEqual(["2026-11-02"]);
    expect(dayRange("2026-11-03", "2026-11-02")).toEqual([]);
  });

  it("rejects a bad date", () => {
    expect(() => dayRange("nope", "2026-11-02")).toThrow();
  });
});

describe("clue repeats across days", () => {
  const use = (day: string, slot: ClueUse["slot"], answer: string, clue: string, number = 1, dir: ClueUse["dir"] = "across"): ClueUse => ({ day, slot, dir, index: 0, number, answer, clue });

  it("compares clues without number, case, punctuation or extra spaces, and nothing more", () => {
    expect(clueKey("12. Pub pint.")).toBe("pub pint");
    expect(clueKey("“Pub  pint!”")).toBe("pub pint");
    expect(clueKey("Rainbow's shape")).not.toBe(clueKey("Rainbow shape"));
  });

  it("reads a feed puzzle's clues with their numbers and answers", () => {
    const uses = clueUses("2026-11-08", "mini", transfer());
    expect(uses).toHaveLength(10);
    expect(uses[0]).toEqual({ day: "2026-11-08", slot: "mini", dir: "across", index: 0, number: 1, answer: "TAPE", clue: "Sticky roll" });
    expect(uses[9]).toMatchObject({ dir: "down", number: 5, answer: "EST", clue: "Little rascal" });
  });

  it("flags the later use of the same clue for the same answer within the window, in any slot", () => {
    const uses = [
      use("2026-11-01", "large", "ERE", "Before, poetically"),
      use("2026-11-08", "mini", "ERE", "Before, poetically."),
      use("2026-11-08", "midi", "ERE", "Prior to, in verse"),
      use("2026-11-09", "midi", "TSA", "Airport screening org."),
      use("2026-11-09", "large", "TSA", "Airport screening org.", 23),
    ];
    const repeats = repeatedClues(uses);
    expect(repeats.map((r) => [r.use.day, r.use.slot, r.earlier.day, r.earlier.slot])).toEqual([
      ["2026-11-08", "mini", "2026-11-01", "large"],
      ["2026-11-09", "large", "2026-11-09", "midi"],
    ]);
    expect(repeatProblem(repeats[1])).toBe('large: 23A TSA repeats "Airport screening org." from the midi the same day');
    expect(repeatProblem(repeats[0])).toBe('mini: 1A ERE repeats "Before, poetically." from the large of 2026-11-01');
  });

  it("lets a clue come back once the window has passed, and never mixes answers", () => {
    const later = new Date(Date.parse("2026-11-01T00:00:00Z") + (CLUE_REPEAT_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
    expect(repeatedClues([use("2026-11-01", "mini", "EEL", "Slippery swimmer"), use(later, "mini", "EEL", "Slippery swimmer")])).toEqual([]);
    expect(repeatedClues([use("2026-11-01", "mini", "EEL", "Slippery swimmer"), use("2026-11-01", "midi", "EELS", "Slippery swimmer")])).toEqual([]);
    expect(daysBetween("2026-11-30", "2026-12-14")).toBe(14);
    expect(repeatedClues([use("2026-11-30", "mini", "EEL", "Slippery swimmer"), use("2026-12-14", "mini", "EEL", "Slippery swimmer")])).toHaveLength(1);
  });

  it("chains: each repeat is measured from the use just before it", () => {
    const repeats = repeatedClues([use("2026-11-01", "mini", "ALE", "Pub pint"), use("2026-11-10", "mini", "ALE", "Pub pint"), use("2026-11-20", "mini", "ALE", "Pub pint")]);
    expect(repeats.map((r) => [r.use.day, r.earlier.day])).toEqual([
      ["2026-11-10", "2026-11-01"],
      ["2026-11-20", "2026-11-10"],
    ]);
  });

  it("lists an answer's recent clues either side of a day, once each, leaving out the puzzle itself", () => {
    const uses = [
      use("2026-10-01", "mini", "ERE", "Long ago"),
      use("2026-11-01", "large", "ERE", "Before, poetically"),
      use("2026-11-08", "mini", "ERE", "Before, poetically."),
      use("2026-11-08", "midi", "ERE", "Own clue"),
      use("2026-11-12", "large", "ERE", "Prior to, in verse"),
      use("2026-11-12", "large", "TSA", "Not this answer"),
    ];
    expect(recentCluesFor(uses, "ere", "2026-11-08", "midi")).toEqual(["Before, poetically", "Prior to, in verse"]);
  });
});
