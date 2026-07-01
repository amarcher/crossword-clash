import { describe, it, expect } from "vitest";
import {
  selectShareMethod,
  buildResultFilename,
  composeCardText,
  computeViewerStanding,
  resultGlyph,
  type ResultCardLabels,
  type StandingPlayer,
} from "./resultCard";

const LABELS: ResultCardLabels = {
  tag: "crosswordclash.com",
  heading: "Solved!",
  newBest: "New best! 🎉",
  best: "best: 3:10",
  winner: "Alex wins!",
  tie: "It's a tie!",
  standing: "Finished #3 of 5",
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

  it("brags the viewer's own standing when provided", () => {
    const card = composeCardText(
      {
        mode: "multiplayer",
        puzzleTitle: "Sunday",
        winnerName: "Alex",
        viewerStanding: { rank: 3, total: 5, won: false, tiedForFirst: false },
      },
      LABELS,
    );
    expect(card.metric).toBe("Finished #3 of 5");
  });

  it("falls back to the winner line when no standing label is available", () => {
    const card = composeCardText(
      {
        mode: "multiplayer",
        winnerName: "Alex",
        viewerStanding: { rank: 2, total: 3, won: false, tiedForFirst: false },
      },
      { ...LABELS, standing: undefined },
    );
    expect(card.metric).toBe("Alex wins!");
  });
});

describe("computeViewerStanding", () => {
  const players: StandingPlayer[] = [
    { userId: "a", cellsClaimed: 10 },
    { userId: "b", cellsClaimed: 7 },
    { userId: "c", cellsClaimed: 4 },
    { userId: "d", cellsClaimed: 1 },
  ];

  it("reports a sole winner as rank 1 with won=true", () => {
    const s = computeViewerStanding(players, "a");
    expect(s).toEqual({ rank: 1, total: 4, won: true, tiedForFirst: false });
  });

  it("reports a co-leader as 'Tied for 1st' — rank 1, NEVER 2 (the critical case)", () => {
    const tied: StandingPlayer[] = [
      { userId: "a", cellsClaimed: 8 },
      { userId: "b", cellsClaimed: 8 },
      { userId: "c", cellsClaimed: 3 },
    ];
    const s = computeViewerStanding(tied, "b");
    expect(s).toEqual({ rank: 1, total: 3, won: false, tiedForFirst: true });
    // The other co-leader reads identically — neither gets demoted to #2.
    expect(computeViewerStanding(tied, "a")?.rank).toBe(1);
  });

  it("reports a mid-pack rank", () => {
    const s = computeViewerStanding(players, "c");
    expect(s).toEqual({ rank: 3, total: 4, won: false, tiedForFirst: false });
  });

  it("reports last place", () => {
    const s = computeViewerStanding(players, "d");
    expect(s).toEqual({ rank: 4, total: 4, won: false, tiedForFirst: false });
  });

  it("uses standard competition ranking for ties below first", () => {
    const midTie: StandingPlayer[] = [
      { userId: "a", cellsClaimed: 10 },
      { userId: "b", cellsClaimed: 5 },
      { userId: "c", cellsClaimed: 5 },
      { userId: "d", cellsClaimed: 2 },
    ];
    // Two players tie for 2nd → both rank 2, next player ranks 4.
    expect(computeViewerStanding(midTie, "b")?.rank).toBe(2);
    expect(computeViewerStanding(midTie, "c")?.rank).toBe(2);
    expect(computeViewerStanding(midTie, "d")?.rank).toBe(4);
  });

  it("returns null when the viewer is not a player (spectator/host)", () => {
    expect(computeViewerStanding(players, "zzz")).toBeNull();
    expect(computeViewerStanding(players, undefined)).toBeNull();
    expect(computeViewerStanding(players, null)).toBeNull();
  });

  it("is order-independent — a co-leader reads rank 1 regardless of array order", () => {
    // Prove the tie-safety property adversarially: same scores, different
    // orderings must all yield rank 1 / tiedForFirst for both co-leaders.
    const base: StandingPlayer[] = [
      { userId: "a", cellsClaimed: 8 },
      { userId: "b", cellsClaimed: 8 },
      { userId: "c", cellsClaimed: 3 },
    ];
    const orderings = [
      base,
      [base[2], base[0], base[1]],
      [base[1], base[2], base[0]],
      [...base].reverse(),
    ];
    for (const order of orderings) {
      expect(computeViewerStanding(order, "a")).toEqual({ rank: 1, total: 3, won: false, tiedForFirst: true });
      expect(computeViewerStanding(order, "b")).toEqual({ rank: 1, total: 3, won: false, tiedForFirst: true });
      expect(computeViewerStanding(order, "c")?.rank).toBe(3);
    }
  });
});

describe("resultGlyph", () => {
  it("only shows a trophy for an actual win, never for a lower placement", () => {
    expect(resultGlyph({ mode: "solo", finishSeconds: 100 })).toBe("🏆");
    expect(resultGlyph({ mode: "multiplayer", viewerStanding: { rank: 1, total: 4, won: true, tiedForFirst: false } })).toBe("🏆");
    expect(resultGlyph({ mode: "multiplayer", viewerStanding: { rank: 1, total: 3, won: false, tiedForFirst: true } })).toBe("🤝");
    expect(resultGlyph({ mode: "multiplayer", viewerStanding: { rank: 3, total: 5, won: false, tiedForFirst: false } })).toBe("🧩");
    // Spectator/winner-card fallback (no per-viewer standing).
    expect(resultGlyph({ mode: "multiplayer", isTie: true })).toBe("🤝");
    expect(resultGlyph({ mode: "multiplayer", isTie: false })).toBe("🏆");
  });
});
