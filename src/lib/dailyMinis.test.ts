import { describe, it, expect } from "vitest";
import { DAILY_MINIS, getDailyMini } from "./dailyMinis";

describe("dailyMinis", () => {
  it("every mini is a well-formed, solvable 5x5 with clues for all entries", () => {
    for (const { theme, puzzle } of DAILY_MINIS) {
      expect(puzzle.width).toBe(5);
      expect(puzzle.height).toBe(5);
      // every non-black cell has a solution letter
      for (const cell of puzzle.cells.flat()) {
        if (cell.solution !== null) expect(cell.solution).toMatch(/^[A-Z]$/);
      }
      // every clue has non-empty text and a matching answer length
      for (const clue of puzzle.clues) {
        expect(clue.text.length).toBeGreaterThan(0);
        expect(clue.text).not.toBe(clue.answer); // real clue, not a fallback
        expect(clue.answer.length).toBe(clue.length);
      }
      // the theme word appears among the answers
      const answers = puzzle.clues.map((c) => c.answer);
      expect(answers).toContain(theme.toUpperCase());
      // no answer repeats (the builder keys clues by answer)
      expect(new Set(answers).size).toBe(answers.length);
    }
  });

  it("getDailyMini is deterministic for a given calendar day", () => {
    const d = new Date(2026, 6, 1);
    expect(getDailyMini(d)).toBe(getDailyMini(new Date(2026, 6, 1)));
  });

  it("rotates to a different index the next day and wraps around", () => {
    const base = new Date(2026, 0, 1);
    const seen = new Set<string>();
    for (let i = 0; i < DAILY_MINIS.length; i++) {
      const d = new Date(2026, 0, 1 + i);
      seen.add(getDailyMini(d).theme);
    }
    // one full cycle visits every mini exactly once
    expect(seen.size).toBe(DAILY_MINIS.length);
    // and it wraps: day 0 and day N land on the same mini
    expect(getDailyMini(base).theme).toBe(
      getDailyMini(new Date(2026, 0, 1 + DAILY_MINIS.length)).theme,
    );
  });
});
