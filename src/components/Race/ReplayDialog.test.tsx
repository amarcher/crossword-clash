// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import "../../i18n/i18n";
import { ReplayDialog, type ReplaySolve } from "./ReplayDialog";
import { buildPuzzle } from "../../lib/samplePuzzles";

/** A race replay is one board (Andrew, 2026-11-16): the first solve's letters, the second's squares as dots. */
const puzzle = buildPuzzle({ title: "Tiny", grid: ["ab", "cd"], clueTexts: {} });
const you: ReplaySolve = { name: "You", color: "#3b82f6", seconds: 20, events: [[2_000, 0, "A"], [8_000, 1, "B"], [14_000, 2, "C"], [20_000, 3, "D"]] };
const ann: ReplaySolve = { name: "Ann", color: "#8b5cf6", seconds: 12, events: [[1_000, 3, "D"], [4_000, 2, "C"], [9_000, 1, "B"], [12_000, 0, "A"]] };

let frames: (FrameRequestCallback | null)[] = [];
const frame = (now: number) =>
  act(() => {
    const queued = frames;
    frames = [];
    for (const cb of queued) cb?.(now);
  });
const letters = () => screen.getAllByRole("gridcell").map((c) => c.textContent?.replace(/\d+/g, "") ?? "").join("|");
const dots = () => document.querySelectorAll("[data-ghost]").length;

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames[id - 1] = null;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReplayDialog", () => {
  it("plays a race on one board: the first solve's letters, the second's squares as dots, one clock", () => {
    render(<ReplayDialog puzzle={puzzle} solves={[you, ann]} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "You vs Ann" })).toBeTruthy();
    expect(screen.getAllByRole("grid")).toHaveLength(1);
    expect(screen.getAllByTestId("replay-racer").map((li) => li.textContent)).toEqual(["You0:00", "Ann0:00"]);
    expect(dots()).toBe(0);

    frame(0); // the clock starts
    frame(1_250); // 5 s of the race at 4×
    expect(letters()).toBe("A|||");
    // Ann has two squares by then, neither of them one of yours.
    expect(dots()).toBe(2);

    frame(5_000); // the end
    expect(letters()).toBe("A|B|C|D");
    expect(dots()).toBe(4);
    // Each clock stops at its own finish.
    expect(screen.getAllByTestId("replay-racer").map((li) => li.textContent)).toEqual(["You0:20", "Ann0:12"]);
  });

  it("plays one solve with its letters and no dots", () => {
    render(<ReplayDialog puzzle={puzzle} solves={[ann]} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Ann's solve" })).toBeTruthy();
    expect(screen.queryAllByTestId("replay-racer")).toHaveLength(0);
    frame(0);
    frame(10_000);
    expect(letters()).toBe("A|B|C|D");
    expect(dots()).toBe(0);
  });

  it("ends on the whole grid: a last letter typed a fraction of a second after the whole-second time still goes in", () => {
    // A time is whole seconds; the last letter of a 20 s solve can land at 20.6 s.
    const late: ReplaySolve = { ...you, events: [...you.events.slice(0, 3), [20_600, 3, "D"]] };
    const lateAnn: ReplaySolve = { ...ann, events: [...ann.events.slice(0, 3), [12_900, 0, "A"]] };
    render(<ReplayDialog puzzle={puzzle} solves={[late, lateAnn]} onClose={() => {}} />);
    frame(0);
    frame(100_000);
    expect(letters()).toBe("A|B|C|D");
    expect(dots()).toBe(4);
  });
});
