import { describe, expect, it } from "vitest";
import type { TransferPuzzle } from "../puzzleNormalizer";
import { clueIssues, crosscheckDay, dayRange, entriesFromRows, entriesFromTransfer, rowsFromTransfer, sharedEntries, stripClueNumber, titleAsEntry } from "./crosscheck";

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
