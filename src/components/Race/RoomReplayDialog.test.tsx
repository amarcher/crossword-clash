// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../../i18n/i18n";
import { RoomReplayDialog } from "./RoomReplayDialog";
import { buildRoomReplay } from "../../lib/roomReplay";
import { buildPuzzle } from "../../lib/samplePuzzles";

/** After a race the room watches the grid fill in again, each square in its claimant's colour (Andrew, 2026-11-14). */
const puzzle = buildPuzzle({ title: "Tiny", grid: ["ab", "cd"], clueTexts: {} });
const players = [
  { userId: "ann", displayName: "Ann", color: "#3b82f6" },
  { userId: "bob", displayName: "Bob", color: "#ef4444" },
];
const replay = buildRoomReplay(
  {
    "0,0": { letter: "A", correct: true, playerId: "ann", at: 2_000 },
    "0,1": { letter: "B", correct: true, playerId: "bob", at: 6_000 },
    "1,0": { letter: "C", correct: true, playerId: "ann", at: 10_000 },
    "1,1": { letter: "D", correct: true, playerId: "ann", at: 20_000 },
  },
  0,
)!;

let frames: (FrameRequestCallback | null)[] = [];
let queued: (FrameRequestCallback | null)[] = [];
const frame = (now: number) =>
  act(() => {
    queued = frames;
    frames = [];
    for (const cb of queued) cb?.(now);
  });
const count = (id: string) => screen.getByTestId(`replay-count-${id}`).textContent;

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

describe("RoomReplayDialog", () => {
  it("plays the claims back sped up, counting each player's squares, and offers it again at the end", () => {
    const onClose = vi.fn();
    render(<RoomReplayDialog puzzle={puzzle} replay={replay} players={players} playerColorMap={{ ann: "#3b82f6", bob: "#ef4444" }} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Race replay" })).toBeTruthy();
    expect(screen.getByText("0:20, played at 4× speed")).toBeTruthy();
    expect([count("ann"), count("bob")]).toEqual(["0", "0"]);

    frame(0); // the clock starts
    frame(1_600); // 6.4 s of the race at 4×
    expect([count("ann"), count("bob")]).toEqual(["1", "1"]);

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    frame(9_000);
    expect([count("ann"), count("bob")]).toEqual(["1", "1"]);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    frame(10_000);
    frame(16_000);
    expect([count("ann"), count("bob")]).toEqual(["3", "1"]);
    fireEvent.click(screen.getByRole("button", { name: "Watch again" }));
    frame(20_000);
    frame(20_100);
    expect([count("ann"), count("bob")]).toEqual(["0", "0"]);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
