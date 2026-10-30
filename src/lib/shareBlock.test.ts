import { describe, it, expect } from "vitest";
import {
  buildShareBlock,
  formatShareDay,
  claimantLegend,
  gridRows,
  paceBar,
  paceThird,
  playerSquare,
  BLACK,
  EMPTY,
  PACE,
  WRONG,
  type ShareBlockInput,
} from "./shareBlock";
import { buildPuzzle } from "./samplePuzzles";
import type { CellState, Puzzle } from "../types/puzzle";

/** 5×5 with a block in two corners (the daily-mini shape). */
function mini(): Puzzle {
  return buildPuzzle({
    title: "Deep Blue",
    grid: ["#whom", "trace", "holes", "atlas", "neon#"],
    clueTexts: {},
  });
}

/** Fill every white cell in reading order, `step` ms apart from `start`. */
function fillInOrder(puzzle: Puzzle, start = 1000, step = 100, playerId?: string): Record<string, CellState> {
  const cells: Record<string, CellState> = {};
  let i = 0;
  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      const cell = puzzle.cells[r][c];
      if (cell.solution === null) continue;
      cells[`${r},${c}`] = { letter: cell.solution, correct: true, playerId, at: start + step * i++ };
    }
  }
  return cells;
}

const LABELS = { brand: "Crossword Clash", cta: "Beat my time" };
const LINK = "https://crosswordclash.com/daily/2026-10-20/mini?beat=102&by=Archer";

function dailyInput(over: Partial<ShareBlockInput> = {}): ShareBlockInput {
  const puzzle = mini();
  return {
    puzzle,
    cells: fillInOrder(puzzle),
    seconds: 102,
    day: "2026-10-20",
    locale: "en-US",
    link: LINK,
    labels: { ...LABELS, daily: "Daily Mini", streak: "5-day streak" },
    ...over,
  };
}

describe("formatShareDay", () => {
  it("formats a local calendar day as a short month and day", () => {
    expect(formatShareDay("2026-10-20", "en-US")).toBe("Oct 20");
    expect(formatShareDay("2026-01-05", "en-US")).toBe("Jan 5");
  });

  it("returns a malformed key untouched", () => {
    expect(formatShareDay("today", "en-US")).toBe("today");
  });
});

describe("paceThird", () => {
  it("splits the span into thirds, with the end in the last third", () => {
    expect(paceThird(0, 0, 300)).toBe(0);
    expect(paceThird(99, 0, 300)).toBe(0);
    expect(paceThird(100, 0, 300)).toBe(1);
    expect(paceThird(199, 0, 300)).toBe(1);
    expect(paceThird(200, 0, 300)).toBe(2);
    expect(paceThird(300, 0, 300)).toBe(2);
  });

  it("treats an untimed cell or a degenerate span as the first third", () => {
    expect(paceThird(undefined, 0, 300)).toBe(0);
    expect(paceThird(50, 50, 50)).toBe(0);
  });
});

describe("playerSquare", () => {
  it("maps the player-colour pool in order and is case-insensitive", () => {
    expect(playerSquare("#3b82f6")).toBe("🟦");
    expect(playerSquare("#EF4444")).toBe("🟥");
    expect(playerSquare("#22c55e")).toBe("🟩");
    expect(playerSquare("#f59e0b")).toBe("🟨");
    expect(playerSquare("#8b5cf6")).toBe("🟪");
    expect(playerSquare("#ec4899")).toBe("🟧");
  });

  it("falls back to an empty square for an unknown or missing colour", () => {
    expect(playerSquare("#123456")).toBe(EMPTY);
    expect(playerSquare(undefined)).toBe(EMPTY);
  });
});

describe("gridRows", () => {
  it("draws one row per grid row with blocks, and paces the fill in thirds", () => {
    const rows = gridRows(dailyInput());
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => [...r].length === 5)).toBe(true);
    expect(rows[0].startsWith(BLACK)).toBe(true);
    expect(rows[4].endsWith(BLACK)).toBe(true);
    // 23 white cells filled 100 ms apart: the first is green, the last orange.
    expect([...rows[0]][1]).toBe(PACE[0]);
    expect([...rows[4]][3]).toBe(PACE[2]);
    // Thirds are by time, so the middle of the sequence is yellow.
    expect([...rows[2]][2]).toBe(PACE[1]);
  });

  it("never shows a letter", () => {
    const text = gridRows(dailyInput()).join("");
    expect(text).not.toMatch(/[A-Za-z]/);
  });

  it("marks a cell that took a wrong letter red, whatever its pace", () => {
    const rows = gridRows(dailyInput({ wrongCells: ["0,1", "4,3"] }));
    expect([...rows[0]][1]).toBe(WRONG);
    expect([...rows[4]][3]).toBe(WRONG);
  });

  it("shows unfilled white cells as empty squares", () => {
    const input = dailyInput();
    delete input.cells["1,0"];
    expect([...gridRows(input)[1]][0]).toBe(EMPTY);
  });

  it("treats untimed (hydrated) cells as the first third", () => {
    const input = dailyInput();
    for (const c of Object.values(input.cells)) delete c.at;
    const rows = gridRows(input);
    expect([...rows[4]][3]).toBe(PACE[0]);
  });

  it("colours a live race by claimant in the player-colour order", () => {
    const puzzle = mini();
    const cells = fillInOrder(puzzle, 1000, 100, "alice");
    cells["0,1"].playerId = "bob";
    cells["2,2"].playerId = undefined;
    const rows = gridRows({
      ...dailyInput({ puzzle, cells }),
      wrongCells: ["0,2"],
      playerColors: { alice: "#3b82f6", bob: "#ef4444" },
    });
    expect([...rows[0]][1]).toBe("🟦".replace("🟦", "🟥")); // bob is red
    expect([...rows[0]][2]).toBe("🟦"); // alice is blue; a race never shows wrong cells
    expect([...rows[2]][2]).toBe(EMPTY); // no claimant on record
  });
});

describe("claimantLegend", () => {
  it("names each player after their square, in the order given, whatever their presence", () => {
    expect(claimantLegend([{ displayName: "Archer", color: "#3b82f6" }, { displayName: "Alicia", color: "#ef4444" }])).toBe(
      "🟦 Archer, 🟥 Alicia",
    );
    expect(claimantLegend([])).toBe("");
  });

  it("gives a player with an unknown colour the empty square", () => {
    expect(claimantLegend([{ displayName: "Zed", color: "#000000" }])).toBe(`${EMPTY} Zed`);
  });
});

describe("paceBar", () => {
  function wide(): Puzzle {
    const row = "abcdefghijk";
    return buildPuzzle({ title: "Wide", grid: Array.from({ length: 3 }, () => row), clueTexts: {} });
  }

  it("is fifteen blocks long and all even when the fill is uniform", () => {
    const puzzle = wide();
    const bar = paceBar({ ...dailyInput({ puzzle, cells: fillInOrder(puzzle, 0, 10) }) });
    expect([...bar]).toHaveLength(15);
    expect([...bar].every((b) => b === PACE[1])).toBe(true);
  });

  it("shows a stall as slow blocks and a burst as fast ones", () => {
    const puzzle = wide();
    const cells = fillInOrder(puzzle, 0, 10); // 33 cells over 320 ms
    // Move the last cell far out: the middle windows empty out (slow), the
    // first windows hold everything (fast).
    cells["2,10"].at = 10_000;
    const bar = [...paceBar({ ...dailyInput({ puzzle, cells }) })];
    expect(bar[0]).toBe(PACE[0]);
    expect(bar[7]).toBe(PACE[2]);
  });

  it("marks the window where a wrong-answered cell was filled", () => {
    const puzzle = wide();
    const cells = fillInOrder(puzzle, 0, 10);
    const bar = [...paceBar({ ...dailyInput({ puzzle, cells, wrongCells: ["0,0"] }) })];
    expect(bar[0]).toBe(WRONG);
  });

  it("gives each window to the player who claimed most in it during a race", () => {
    const puzzle = wide();
    const cells = fillInOrder(puzzle, 0, 10, "alice");
    for (const key of ["2,8", "2,9", "2,10"]) cells[key].playerId = "bob";
    const bar = [...paceBar({ ...dailyInput({ puzzle, cells }), playerColors: { alice: "#3b82f6", bob: "#ef4444" } })];
    expect(bar[0]).toBe("🟦");
    expect(bar[14]).toBe("🟥");
  });

  it("is a neutral bar when nothing is timed", () => {
    const puzzle = wide();
    const cells = fillInOrder(puzzle);
    for (const c of Object.values(cells)) delete c.at;
    expect(paceBar({ ...dailyInput({ puzzle, cells }) })).toBe(PACE[1].repeat(15));
  });
});

describe("buildShareBlock", () => {
  it("builds the daily block: header with date, stats, five rows, then the link", () => {
    const block = buildShareBlock(dailyInput());
    expect(block.header).toBe("Crossword Clash · Daily Mini · Oct 20");
    expect(block.stats).toBe("⏱ 1:42 · 🔥 5-day streak");
    expect(block.grid).toHaveLength(5);
    expect(block.cta).toBe("Beat my time →");
    expect(block.text.split("\n")).toEqual([
      "Crossword Clash · Daily Mini · Oct 20",
      "⏱ 1:42 · 🔥 5-day streak",
      ...block.grid,
      `Beat my time → ${LINK}`,
    ]);
    expect(block.body).toBe(block.text.slice(0, block.text.lastIndexOf("\n")));
  });

  it("names the puzzle instead of the date when it is not a daily", () => {
    const block = buildShareBlock(dailyInput({ day: undefined, labels: { ...LABELS } }));
    expect(block.header).toBe("Crossword Clash · Deep Blue");
    expect(block.stats).toBe("⏱ 1:42");
  });

  it("omits the stats line when there is nothing to say", () => {
    const block = buildShareBlock(dailyInput({ seconds: undefined, labels: { ...LABELS, cta: "Play it" } }));
    expect(block.stats).toBeNull();
    expect(block.text.split("\n")[1]).toBe(block.grid[0]);
    expect(block.text.endsWith(`Play it → ${LINK}`)).toBe(true);
  });

  it("puts a multiplayer standing on the stats line", () => {
    const block = buildShareBlock(dailyInput({ labels: { ...LABELS, standing: "Finished #2 of 4" } }));
    expect(block.stats).toBe("⏱ 1:42 · Finished #2 of 4");
  });

  it("uses one pace bar instead of rows for a grid wider than nine", () => {
    const puzzle = buildPuzzle({ title: "Big", grid: Array.from({ length: 15 }, () => "abcdefghijklmno"), clueTexts: {} });
    const block = buildShareBlock(dailyInput({ puzzle, cells: fillInOrder(puzzle), labels: { ...LABELS, daily: "Daily Large" } }));
    expect(block.grid).toHaveLength(1);
    expect([...block.grid[0]]).toHaveLength(15);
  });

  it("keeps a nine-wide grid as rows", () => {
    const puzzle = buildPuzzle({ title: "Midi", grid: Array.from({ length: 9 }, () => "abcdefghi"), clueTexts: {} });
    const block = buildShareBlock(dailyInput({ puzzle, cells: fillInOrder(puzzle) }));
    expect(block.grid).toHaveLength(9);
  });
});
