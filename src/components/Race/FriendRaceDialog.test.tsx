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
const standings = () => screen.getAllByTestId("race-standing").map((el) => el.textContent?.replace(/^.*: /, ""));
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
  it("plays every solve on one clock: each lane keeps its row and shows its place, squares to whoever got there first", () => {
    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann, bo]} letters onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "The race" })).toBeTruthy();

    // Dragged to 5 s: Ann has two squares, you one, Bo one.
    fireEvent.change(screen.getByRole("slider", { name: "Race clock" }), { target: { value: "5000" } });
    // Rows stay as they were given; only the place numbers move.
    expect(lanes()).toEqual(["2YouSquares each solver was first to: 125%Y", "1annSquares each solver was first to: 250%A", "3boSquares each solver was first to: 125%B"]);
    expect(owners()).toEqual(["me:A", "bo:B", "ann:C", "ann:D"]);
    // Each lane carries its own count of squares won.
    expect(standings()).toEqual(["1", "2", "1"]);

    fireEvent.change(screen.getByRole("slider", { name: "Race clock" }), { target: { value: "30000" } });
    expect(lanes()).toEqual(["2YouSquares each solver was first to: 10:20Y", "1annSquares each solver was first to: 20:12A", "3boSquares each solver was first to: 10:30B"]);
  });

  it("offers a head-to-head as both solves on one board: the first's letters, the second's squares as corner marks", () => {
    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann]} letters onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "You vs ann" })).toBeTruthy();
    expect(screen.queryByRole("grid")).toBeNull();
    fireEvent.change(screen.getByRole("slider", { name: "Race clock" }), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Both solves" }));
    expect(screen.getAllByRole("gridcell").map((c) => c.textContent?.replace(/\d+/g, "") ?? "").join("|")).toBe("A|||");
    expect(document.querySelectorAll("[data-ghost]").length).toBe(2);
    // Three in the race, or no letters: one reading only.
    cleanup();
    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann, bo]} letters onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Both solves" })).toBeNull();
    cleanup();
    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann]} letters={false} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Both solves" })).toBeNull();
  });

  it("works the race out again for whoever is left when a solver is hidden", () => {
    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann, bo]} letters onClose={() => {}} />);
    fireEvent.change(screen.getByRole("slider", { name: "Race clock" }), { target: { value: "30000" } });
    fireEvent.click(screen.getByRole("button", { name: "ann" }));
    expect(lanes()).toEqual(["1YouSquares each solver was first to: 30:20Y", "2boSquares each solver was first to: 10:30B"]);
    // Ann's two squares go to whoever of the rest was first to them.
    expect(owners()).toEqual(["me:A", "bo:B", "me:C", "me:D"]);
    // The last one showing cannot be hidden.
    fireEvent.click(screen.getByRole("button", { name: "bo" }));
    fireEvent.click(screen.getByRole("button", { name: "You" }));
    expect(lanes()).toEqual(["1YouSquares each solver was first to: 40:20Y"]);
  });

  it("a lane's name is the chip that hides its solver; hidden solvers wait under the lanes and come back on a tap", () => {
    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann, bo]} letters onClose={() => {}} />);
    // No separate row of names: the only "ann" button is the one on ann's lane.
    const chip = screen.getByRole("button", { name: "ann" });
    expect(chip.closest("[data-testid=race-lane]")).toBeTruthy();
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("group", { name: "Left out of the race" })).toBeNull();
    fireEvent.click(chip);
    const benched = screen.getByRole("group", { name: "Left out of the race" });
    expect(benched.textContent).toBe("ann");
    expect(screen.getByRole("button", { name: "ann" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "ann" }));
    expect(screen.getAllByTestId("race-lane")).toHaveLength(3);
    cleanup();
    // Two solvers are the whole race: their names are not controls.
    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann]} letters onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "ann" })).toBeNull();
  });

  it("offers Add friend on the lanes it is told to, and says Requested once asked", async () => {
    const onAddFriend = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann, bo]} letters={false} clip friendable={new Set(["ann"])} onAddFriend={onAddFriend} onClose={() => {}} />);
    expect(screen.getAllByTestId("race-add-friend")).toHaveLength(1);
    const add = screen.getByRole("button", { name: "Add ann as a friend" });
    expect(add.closest("[data-testid=race-lane]")?.textContent).toContain("ann");
    // A request that fails says so and leaves the button.
    await act(async () => fireEvent.click(add));
    expect(screen.getByRole("status").textContent).toBe("That didn't go through. Please try again.");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add ann as a friend" })));
    expect(onAddFriend).toHaveBeenLastCalledWith(ann);
    expect(screen.queryByTestId("race-add-friend")).toBeNull();
    expect(screen.getAllByTestId("race-lane")[1].textContent).toContain("Requested");
  });

  it("shares the puzzle's link carrying a clip of whoever is showing; no Share without a link to send", async () => {
    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann, bo]} letters shareRef={{ day: "2026-11-16", slot: "mini" }} onClose={() => {}} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });
    expect(share.create).toHaveBeenCalledTimes(1);
    expect(share.send.mock.calls[0][0]).toMatchObject({ url: "https://crosswordclash.com/daily/2026-11-16/mini?r=abcdefghijk&race=3" });
    // "You" is nobody to the others, so this link names no one; named solvers ride along in the clip's order.
    cleanup();
    share.send.mockClear();
    render(<FriendRaceDialog puzzle={puzzle} solves={[{ ...you, name: "archer" }, ann]} letters shareRef={{ day: "2026-11-16", slot: "mini" }} onClose={() => {}} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });
    expect(share.send.mock.calls[0][0]).toMatchObject({ url: "https://crosswordclash.com/daily/2026-11-16/mini?r=abcdefghijk&race=2&who=archer%2Cann" });
    expect(screen.getByRole("status").textContent).toBe("Link copied — paste it anywhere");
    cleanup();

    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann]} letters onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    cleanup();

    // A Daily Plus race shares its day's link the same way, and says which puzzle it is.
    share.send.mockClear();
    render(<FriendRaceDialog puzzle={puzzle} solves={[{ ...you, name: "archer" }, ann]} letters shareRef={{ bonusDay: "2026-11-18" }} onClose={() => {}} />);
    expect(screen.getByTestId("race-puzzle").textContent).toBe("Daily Plus · Nov 18 · Tiny");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });
    expect(share.send.mock.calls[0][0]).toMatchObject({ url: "https://crosswordclash.com/bonus/2026-11-18?r=abcdefghijk&race=2&who=archer%2Cann" });
  });

  it("says which puzzle and how it was replayed, and keeps the legend behind a button", () => {
    render(<FriendRaceDialog puzzle={puzzle} solves={[you, ann]} letters shareRef={{ day: "2026-11-16", slot: "mini" }} onClose={() => {}} />);
    expect(screen.getByTestId("race-puzzle").textContent).toBe("Daily Mini · Nov 16 · Tiny");
    expect(screen.getByText("Replayed head-to-head")).toBeTruthy();
    expect(screen.queryByText(/first to the square/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "How to read the race" }));
    // A key to what is showing: whose colour a square takes, then, for both solves, whose letters and whose corner mark.
    const key = () => [...screen.getByRole("note").querySelectorAll("li")].map((li) => li.textContent);
    expect(key()).toEqual(["Share of the grid filled", "AYou was first to the square", "Aann was first to the square", "4× speed, same start"]);
    fireEvent.click(screen.getByRole("button", { name: "Both solves" }));
    expect(key()).toEqual(["Share of the grid filled", "AYou's letters", "Filled by ann", "4× speed, same start"]);
  });

  it("opens a big circle on its first eight, and says why nine cannot be shared", async () => {
    const many = Array.from({ length: 10 }, (_, i): RaceSolve => ({ ...ann, id: `f${i}`, name: `f${i}`, seconds: 12 + i }));
    render(<FriendRaceDialog puzzle={puzzle} solves={many} letters shareRef={{ day: "2026-11-16", slot: "mini" }} onClose={() => {}} />);
    expect(screen.getAllByTestId("race-lane")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "f9" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "f9" }));
    expect(screen.getAllByTestId("race-lane")).toHaveLength(9);
    share.create.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });
    expect(share.create).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("up to 8 people");
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
