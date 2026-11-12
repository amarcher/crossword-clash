import { describe, expect, it } from "vitest";
import { decodeReplay, encodeReplay } from "./replayCode";
import { buildDailyLink } from "./dailyChallenge";
import type { TraceEvent } from "./race";

const grid = (w: number, h: number, black: number[] = []) => ({
  width: w,
  height: h,
  cells: Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => ({ solution: black.includes(r * w + c) ? null : "A" }))),
});

describe("replay codes", () => {
  it("keeps each square's first fill, ignoring erases and retypes, and no letters", () => {
    const events: TraceEvent[] = [
      [1000, 0, "Q"],
      [1500, 0, ""],
      [2000, 0, "C"],
      [2600, 1, "A"],
    ];
    const decoded = decodeReplay(encodeReplay(grid(2, 1), events, 3)!)!;
    expect(decoded.fills).toEqual([1000, 2600]);
    expect(JSON.stringify(decoded)).not.toMatch(/[QCA]"/);
  });

  it("marks squares the recording never filled as unknown", () => {
    const decoded = decodeReplay(encodeReplay(grid(3, 1, [1]), [[500, 0, "A"]], 2)!)!;
    expect(decoded.fills).toEqual([500, null, null]);
    expect(decoded.blocks).toEqual([false, true, false]);
  });

  it("is short for a mini and refuses a grid it can't describe", () => {
    const events: TraceEvent[] = Array.from({ length: 25 }, (_, i) => [i * 3000, i, "A"]);
    expect(encodeReplay(grid(5, 5), events, 75)!.length).toBeLessThan(80);
    expect(encodeReplay(grid(26, 3), [], 10)).toBeNull();
    expect(encodeReplay(grid(5, 5), events, Number.NaN)).toBeNull();
  });

  it("rides on the daily link as r, and only when it looks like a code", () => {
    expect(buildDailyLink("https://x.test", { day: "2026-11-12", slot: "mini", seconds: 74, name: "Andrew", replay: "AQUF_-x" })).toBe(
      "https://x.test/daily/2026-11-12/mini?beat=74&by=Andrew&r=AQUF_-x",
    );
    expect(buildDailyLink("https://x.test", { day: "2026-11-12", slot: "mini", seconds: 74, replay: "<script>" })).toBe("https://x.test/daily/2026-11-12/mini?beat=74");
  });
});
