import { describe, expect, it } from "vitest";
import { decodeReplay, encodeReplay, REPLAY_KIND, replayEvents } from "./replayCode";
import { buildDailyLink } from "./dailyChallenge";
import type { ReplayMark, TraceEvent } from "./race";

/** A grid whose every white square's answer is "A". */
const grid = (w: number, h: number, black: number[] = []) => ({
  width: w,
  height: h,
  cells: Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => ({ solution: black.includes(r * w + c) ? null : "A" }))),
});

describe("the replay timeline", () => {
  it("judges each letter against the answer and keeps no letters", () => {
    const events: TraceEvent[] = [
      [1000, 0, "Q"],
      [1500, 0, ""],
      [2000, 0, "a"],
      [2600, 1, "A"],
    ];
    expect(replayEvents(grid(2, 1), events)).toEqual([
      { ms: 1000, cell: 0, kind: REPLAY_KIND.wrong },
      { ms: 1500, cell: 0, kind: REPLAY_KIND.emptied },
      { ms: 2000, cell: 0, kind: REPLAY_KIND.right },
      { ms: 2600, cell: 1, kind: REPLAY_KIND.right },
    ]);
  });

  it("weaves in refusals and clue changes in time order", () => {
    const marks: ReplayMark[] = [
      [0, 0, "a"],
      [800, 1, "r"],
      [2600, 0, "d"],
    ];
    const kinds = replayEvents(grid(2, 2), [[500, 0, "A"], [2600, 2, "A"]], marks).map((e) => e.kind);
    expect(kinds).toEqual([REPLAY_KIND.across, REPLAY_KIND.right, REPLAY_KIND.refused, REPLAY_KIND.right, REPLAY_KIND.down]);
  });
});

describe("replay codes", () => {
  it("round-trips the timeline (to the tenth of a second) and the grid's shape", () => {
    const events: TraceEvent[] = [
      [1040, 0, "Q"],
      [1490, 0, ""],
      [2000, 2, "A"],
    ];
    const marks: ReplayMark[] = [[300, 0, "a"], [1200, 2, "r"]];
    const decoded = decodeReplay(encodeReplay(grid(3, 1, [1]), events, 4, marks)!)!;
    expect(decoded).toMatchObject({ width: 3, height: 1, blocks: [false, true, false], seconds: 4 });
    expect(decoded.events).toEqual([
      { ms: 300, cell: 0, kind: REPLAY_KIND.across },
      { ms: 1000, cell: 0, kind: REPLAY_KIND.wrong },
      { ms: 1200, cell: 2, kind: REPLAY_KIND.refused },
      { ms: 1500, cell: 0, kind: REPLAY_KIND.emptied },
      { ms: 2000, cell: 2, kind: REPLAY_KIND.right },
    ]);
  });

  it("is short for a mini, a few hundred characters for a 15×15, and refuses a grid it can't describe", () => {
    const fill = (n: number, gap: number): TraceEvent[] => Array.from({ length: n }, (_, i) => [i * gap, i, "A"]);
    const clues = (n: number): ReplayMark[] => Array.from({ length: n }, (_, i) => [i * 2000, i, i % 2 ? "d" : "a"]);
    expect(encodeReplay(grid(5, 5), fill(25, 3000), 75, clues(10))!.length).toBeLessThan(160);
    expect(encodeReplay(grid(15, 15), fill(225, 2000), 450, clues(80))!.length).toBeLessThan(900);
    expect(encodeReplay(grid(26, 3), [], 10)).toBeNull();
    expect(encodeReplay(grid(5, 5), [], Number.NaN)).toBeNull();
  });

  it("refuses anything malformed", () => {
    // Another version, a kind past 5, a square outside the grid, an event after the finish, junk.
    for (const bad of ["", "!!!!", "AQIBAAIBAA", "AgIBAAIGAA", "AgIBAAIBEA", "AgIBAAL4AwA"]) expect(decodeReplay(bad)).toBeNull();
    expect(decodeReplay(encodeReplay(grid(2, 1), [[0, 0, "A"]], 2)!)).not.toBeNull();
  });

  it("rides on the daily link as r, and only when it looks like a code", () => {
    expect(buildDailyLink("https://x.test", { day: "2026-11-12", slot: "mini", seconds: 74, name: "Andrew", replay: "AQUF_-x" })).toBe(
      "https://x.test/daily/2026-11-12/mini?beat=74&by=Andrew&r=AQUF_-x",
    );
    expect(buildDailyLink("https://x.test", { day: "2026-11-12", slot: "mini", seconds: 74, replay: "<script>" })).toBe("https://x.test/daily/2026-11-12/mini?beat=74");
  });
});
