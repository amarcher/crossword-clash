import { describe, it, expect } from "vitest";
import {
  selectShareMethod,
  buildResultFilename,
  composeCardText,
  type ResultCardLabels,
} from "./resultCard";

const LABELS: ResultCardLabels = {
  tag: "crosswordclash.com",
  heading: "Solved!",
  newBest: "New best! 🎉",
  best: "best: 3:10",
  winner: "Alex wins!",
  tie: "It's a tie!",
};

describe("selectShareMethod", () => {
  it("prefers native web share when files can be shared", () => {
    expect(
      selectShareMethod({ canShareFiles: true, canCopy: true }),
    ).toBe("webshare");
    expect(
      selectShareMethod({ canShareFiles: true, canCopy: false }),
    ).toBe("webshare");
  });

  it("falls back to copy when web share is unavailable but clipboard works", () => {
    expect(
      selectShareMethod({ canShareFiles: false, canCopy: true }),
    ).toBe("copy");
  });

  it("falls back to download when nothing else is available", () => {
    expect(
      selectShareMethod({ canShareFiles: false, canCopy: false }),
    ).toBe("download");
  });
});

describe("buildResultFilename", () => {
  it("slugifies the puzzle title", () => {
    expect(buildResultFilename("Monday Mini")).toBe(
      "crossword-clash-monday-mini.png",
    );
  });

  it("collapses punctuation and trims dashes", () => {
    expect(buildResultFilename("  The New York Times!  ")).toBe(
      "crossword-clash-the-new-york-times.png",
    );
  });

  it("falls back to a generic name for empty or symbol-only titles", () => {
    expect(buildResultFilename("")).toBe("crossword-clash-result.png");
    expect(buildResultFilename(undefined)).toBe("crossword-clash-result.png");
    expect(buildResultFilename("!!!")).toBe("crossword-clash-result.png");
  });

  it("never produces an over-long filename", () => {
    const name = buildResultFilename("x".repeat(200));
    expect(name.length).toBeLessThanOrEqual("crossword-clash-".length + 40 + 4);
  });
});

describe("composeCardText (solo)", () => {
  it("shows the finish time as the metric and the new-best note when applicable", () => {
    const card = composeCardText(
      {
        mode: "solo",
        puzzleTitle: "Monday Mini",
        finishSeconds: 272,
        bestSeconds: 272,
        isNewBest: true,
      },
      LABELS,
    );
    expect(card.heading).toBe("Solved!");
    expect(card.title).toBe("Monday Mini");
    expect(card.metric).toBe("4:32");
    expect(card.detail).toBe("New best! 🎉");
    expect(card.tag).toBe("crosswordclash.com");
  });

  it("shows the best-time note when not a new best", () => {
    const card = composeCardText(
      { mode: "solo", finishSeconds: 200, bestSeconds: 190, isNewBest: false },
      LABELS,
    );
    expect(card.metric).toBe("3:20");
    expect(card.detail).toBe("best: 3:10");
  });

  it("omits the detail when there is no best time", () => {
    const card = composeCardText(
      { mode: "solo", finishSeconds: 200 },
      LABELS,
    );
    expect(card.detail).toBeUndefined();
  });

  it("falls back to a generic title when none is given", () => {
    const card = composeCardText({ mode: "solo", finishSeconds: 60 }, LABELS);
    expect(card.title).toBe("Crossword");
  });

  it("leaves the metric empty when no finish time is available", () => {
    const card = composeCardText({ mode: "solo" }, LABELS);
    expect(card.metric).toBe("");
  });
});

describe("composeCardText (multiplayer)", () => {
  it("shows the winner as the metric", () => {
    const card = composeCardText(
      { mode: "multiplayer", puzzleTitle: "Sunday", winnerName: "Alex" },
      LABELS,
    );
    expect(card.metric).toBe("Alex wins!");
    expect(card.detail).toBeUndefined();
  });

  it("shows a tie line when the game tied", () => {
    const card = composeCardText(
      { mode: "multiplayer", puzzleTitle: "Sunday", isTie: true },
      LABELS,
    );
    expect(card.metric).toBe("It's a tie!");
  });
});
