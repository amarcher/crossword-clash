import { describe, it, expect } from "vitest";
import { computeViewerStanding, type StandingPlayer } from "./resultCard";

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
