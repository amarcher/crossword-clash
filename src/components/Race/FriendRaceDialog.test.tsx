// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../../i18n/i18n";
import { FriendRaceDialog } from "./FriendRaceDialog";
import { buildPuzzle } from "../../lib/samplePuzzles";
import type { RaceSolve } from "../../lib/friendRace";

const puzzle = buildPuzzle({ title: "Tiny", grid: ["ab", "cd"], clueTexts: {} });
const you: RaceSolve = { id: "me", name: "You", color: "#3a6bf0", seconds: 20, events: [[2_000, 0, "A"], [8_000, 1, "B"], [14_000, 2, "C"], [20_000, 3, "D"]] };
const ann: RaceSolve = { id: "ann", name: "ann", color: "#ef4444", seconds: 12, events: [[1_000, 3, "D"], [4_000, 2, "C"], [9_000, 1, "B"], [12_000, 0, "A"]] };
const bo: RaceSolve = { id: "bo", name: "bo", color: "#22c55e", seconds: 30, events: [[3_000, 1, "B"], [10_000, 0, "A"], [20_000, 2, "C"], [30_000, 3, "D"]] };

let frames: (FrameRequestCallback | null)[] = [];
const frame = (now: number) =>
  act(() => {
    const queued = frames;
    frames = [];
    for (const cb of queued) cb?.(now);
  });
const lanes = () => screen.getAllByTestId("race-lane").map((li) => li.textContent);
const standings = () => screen.getAllByTestId("race-standing").map((li) => li.textContent);
const owners = () => [...document.querySelectorAll("[data-owner]")].map((c) => `${c.getAttribute("data-owner")}:${c.textContent}`);

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

const share = vi.hoisted(() => ({ create: vi.fn(async () => "abcdefghijk"), send: vi.fn(async (_payload: { url: string }) => ({ method: "copy", outcome: "copied" })) }));
vi.mock("../../lib/replayShare", () => ({ createReplayShare: share.create }));
vi.mock("../../lib/shareSheet", () => ({ shareText: share.send }));
vi.mock("../CompletionModal/ShareResultButton", () => ({ runtimeDeps: async () => ({}) }));

describe("FriendRaceDialog", () => {
  it("plays every solve on one clock: lanes in running order, squares to whoever got there first", () => {
    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann, bo]} letters onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "The race" })).toBeTruthy();

    // Dragged to 5 s: Ann has two squares, you one, Bo one.
    fireEvent.change(screen.getByRole("slider", { name: "Race clock" }), { target: { value: "5000" } });
    expect(lanes()).toEqual(["1ann50%A", "2You25%Y", "3bo25%B"]);
    expect(owners()).toEqual(["me:A", "bo:B", "ann:C", "ann:D"]);
    expect(standings()).toEqual(["ann2", "You1", "bo1"]);

    fireEvent.change(screen.getByRole("slider", { name: "Race clock" }), { target: { value: "30000" } });
    expect(lanes()).toEqual(["1ann0:12A", "2You0:20Y", "3bo0:30B"]);
  });

  it("works the race out again for whoever is left when a solver is hidden", () => {
    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann, bo]} letters onClose={() => {}} />);
    fireEvent.change(screen.getByRole("slider", { name: "Race clock" }), { target: { value: "30000" } });
    fireEvent.click(screen.getByRole("button", { name: "ann" }));
    expect(lanes()).toEqual(["1You0:20Y", "2bo0:30B"]);
    // Ann's two squares go to whoever of the rest was first to them.
    expect(owners()).toEqual(["me:A", "bo:B", "me:C", "me:D"]);
    // The last one showing cannot be hidden.
    fireEvent.click(screen.getByRole("button", { name: "bo" }));
    fireEvent.click(screen.getByRole("button", { name: "You" }));
    expect(lanes()).toEqual(["1You0:20Y"]);
  });

  it("shares the puzzle's link carrying a clip of whoever is showing; no Share without a link to send", async () => {
    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann, bo]} letters shareRef={{ day: "2026-11-16", slot: "mini" }} onClose={() => {}} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });
    expect(share.create).toHaveBeenCalledTimes(1);
    expect(share.send.mock.calls[0][0]).toMatchObject({ url: "https://crosswordclash.com/daily/2026-11-16/mini?r=abcdefghijk" });
    expect(screen.getByRole("status").textContent).toBe("Link copied — paste it anywhere");
    cleanup();

    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann]} letters onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });

  it("shows colour and no letters to a viewer who has not solved the puzzle", () => {
    const blind = (s: RaceSolve): RaceSolve => ({ ...s, events: s.events.map(([ms, cell]) => [ms, cell, 1]) });
    render(<FriendRaceDialog puzzle={puzzle} solves={[blind(ann), blind(bo)]} letters={false} onClose={() => {}} />);
    frame(0);
    frame(100_000);
    expect(owners()).toEqual(["bo:", "bo:", "ann:", "ann:"]);
    // Two solvers need no filter.
    expect(screen.queryByRole("group", { name: "Who is in the race" })).toBeNull();
  });
});
