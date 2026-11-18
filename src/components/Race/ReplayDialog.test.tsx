// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../../i18n/i18n";
import { ReplayDialog, type ReplaySolve } from "./ReplayDialog";
import { buildPuzzle } from "../../lib/samplePuzzles";

/** A race replay opens the race (Andrew, 2026-11-17); both solves on one board is its other reading. */
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
  it("opens a race as the race: lanes and who got there first, with both solves on one board a tap away", () => {
    render(<ReplayDialog puzzle={puzzle} solves={[you, ann]} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "You vs Ann" })).toBeTruthy();
    expect(screen.getAllByTestId("race-lane")).toHaveLength(2);
    expect(screen.queryByRole("grid")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Both solves" }));
    expect(dots()).toBe(0);

    frame(0); // the clock starts
    frame(1_250); // 5 s of the race at 4×
    expect(letters()).toBe("A|||");
    // Ann has two squares by then, neither of them one of yours.
    expect(dots()).toBe(2);

    frame(5_000); // the end
    expect(letters()).toBe("A|B|C|D");
    expect(dots()).toBe(4);
  });

  it("plays one solve in the same dialog: its own lane, the letters as they were typed", () => {
    render(<ReplayDialog puzzle={puzzle} solves={[ann]} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Ann's solve" })).toBeTruthy();
    expect(screen.getAllByTestId("race-lane")).toHaveLength(1);
    frame(0);
    frame(10_000);
    expect(letters()).toBe("A|B|C|D");
    expect(dots()).toBe(0);
  });

  it("gives nothing away from a recording without letters: color only", () => {
    const blind: ReplaySolve = { ...ann, events: ann.events.map(([ms, cell]) => [ms, cell, 1]) };
    render(<ReplayDialog puzzle={puzzle} solves={[blind]} onClose={() => {}} />);
    // No race to speak of: no place, no squares won, and the header says the letters are held back.
    expect(screen.getByText("Replayed, letters hidden")).toBeTruthy();
    expect(screen.getByTestId("race-lane").textContent).toBe("Ann0%A");
    expect(screen.queryByTestId("race-standing")).toBeNull();
    expect(screen.queryByTestId("race-share")).toBeNull();
    frame(0);
    frame(10_000);
    expect([...document.querySelectorAll("[data-owner]")].map((c) => c.textContent).join("|")).toBe("|||");
  });

  it("ends on the whole grid: a last letter typed a fraction of a second after the whole-second time still goes in", () => {
    // A time is whole seconds; the last letter of a 20 s solve can land at 20.6 s.
    const late: ReplaySolve = { ...you, events: [...you.events.slice(0, 3), [20_600, 3, "D"]] };
    const lateAnn: ReplaySolve = { ...ann, events: [...ann.events.slice(0, 3), [12_900, 0, "A"]] };
    render(<ReplayDialog puzzle={puzzle} solves={[late, lateAnn]} onClose={() => {}} />);
    frame(0);
    frame(100_000);
    // Every square has its owner at the end, and so does the board of both solves.
    expect(document.querySelectorAll("[data-owner]").length).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "Both solves" }));
    frame(100_000);
    expect(letters()).toBe("A|B|C|D");
    expect(dots()).toBe(4);
  });
});
