// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import { PuzzlePickerScreen, pickerPath } from "./PuzzlePickerScreen";
import { getDailyMini } from "../lib/dailyMinis";
import { puzzleIdentity } from "../lib/soloStats";
import type { Puzzle } from "../types/puzzle";

const navigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});

const mini = getDailyMini(new Date(2026, 9, 20));
const midi = { theme: "Jazz", puzzle: { ...getDailyMini(new Date(2026, 9, 21)).puzzle, title: "Blue Note", width: 9, height: 9 } };

let dailies: { mini: typeof mini | undefined; midi: typeof midi | undefined; large: null | undefined } = { mini, midi, large: null };
vi.mock("../hooks/useNextUp", () => ({
  useTodaysDailies: () => dailies,
}));
let bestTimes: Record<string, number> = {};
vi.mock("../hooks/useSolveHistory", () => ({ useBestTimes: () => bestTimes }));

const game = {
  puzzle: null as Puzzle | null,
  isComplete: false,
  displayName: "Andy",
  reset: vi.fn(),
  loadPuzzle: vi.fn(),
  setGameId: vi.fn(),
  setIsMultiplayer: vi.fn(),
  setUrlPuzzle: vi.fn(),
  setCompletionModalDismissed: vi.fn(),
};
vi.mock("../contexts/GameContext", () => ({ useGame: () => game, STORAGE_KEY: "crossword-clash-solo" }));

const mp = { shareCode: null as string | null, broadcastNewGame: vi.fn() };
vi.mock("../contexts/MultiplayerContext", () => ({ useMultiplayerContext: () => mp }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" }, loading: false }) }));

const uploadPuzzle = vi.fn(async () => "puzzle-123");
const createNextGame = vi.fn(async () => ({ gameId: "game-2", shortCode: "ABCDEF" }));
vi.mock("../lib/puzzleService", () => ({
  uploadPuzzle: (...a: unknown[]) => uploadPuzzle(...(a as [])),
  createNextGame: (...a: unknown[]) => createNextGame(...(a as [])),
}));
const saveMpSession = vi.fn();
const clearMpSession = vi.fn();
vi.mock("../lib/sessionPersistence", () => ({
  saveMpSession: (...a: unknown[]) => saveMpSession(...(a as [])),
  clearMpSession: () => clearMpSession(),
}));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));

/** The midi's "Pick" (the mini is listed first). */
function pickMidi() {
  const dailiesSection = screen.getByRole("region", { name: "Today's dailies" });
  const card = within(dailiesSection).getByText("Blue Note").closest("li")!;
  fireEvent.click(within(card).getByRole("button", { name: /Pick|Setting up/ }));
}

function renderPicker(intent: "race" | "next") {
  return render(
    <MemoryRouter initialEntries={[pickerPath(intent)]}>
      <PuzzlePickerScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  bestTimes = {};
  dailies = { mini, midi, large: null };
  game.puzzle = null;
  game.isComplete = false;
  mp.shareCode = null;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PuzzlePickerScreen", () => {
  it("lists only today's unsolved dailies, never the puzzle just finished", () => {
    game.puzzle = mini.puzzle;
    game.isComplete = true;
    renderPicker("race");
    const dailiesSection = screen.getByRole("region", { name: "Today's dailies" });
    expect(within(dailiesSection).getByText("Blue Note")).toBeTruthy();
    expect(within(dailiesSection).queryByText(mini.puzzle.title)).toBeNull();
    expect(within(dailiesSection).getByText("9×9 · Jazz")).toBeTruthy();
  });

  it("says so when every daily is done, and waits while the feed is still answering", () => {
    bestTimes = { [puzzleIdentity(mini.puzzle)]: 60, [puzzleIdentity(midi.puzzle)]: 90 };
    renderPicker("race");
    expect(screen.getByText(/solved all of today's dailies/)).toBeTruthy();
    cleanup();
    dailies = { mini: undefined, midi: undefined, large: undefined };
    renderPicker("race");
    expect(screen.getByText(/Loading today's dailies/)).toBeTruthy();
    expect(screen.queryByText(/solved all of today's dailies/)).toBeNull();
  });

  it("race: tears down the finished state and hands the pick to the host flow as urlPuzzle", async () => {
    renderPicker("race");
    pickMidi();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/host-game/name", { replace: true }));
    expect(game.reset).toHaveBeenCalled();
    expect(clearMpSession).toHaveBeenCalled();
    expect(game.setUrlPuzzle).toHaveBeenCalledWith(midi.puzzle);
    expect(createNextGame).not.toHaveBeenCalled();
  });

  it("next: uploads the chosen puzzle and starts the room's next game with ITS id (the solved puzzle_id is never reused)", async () => {
    mp.shareCode = "ABCDEF";
    renderPicker("next");
    pickMidi();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/lobby/game-2", { replace: true }));
    expect(uploadPuzzle).toHaveBeenCalledWith(midi.puzzle);
    expect(createNextGame).toHaveBeenCalledWith("puzzle-123", "me", "ABCDEF", { displayName: "Andy" });
    expect(mp.broadcastNewGame).toHaveBeenCalledWith("game-2");
    expect(game.setGameId).toHaveBeenCalledWith("game-2");
    expect(game.setCompletionModalDismissed).toHaveBeenCalledWith(false);
    expect(saveMpSession).toHaveBeenCalledWith({ gameId: "game-2", shareCode: "ABCDEF", displayName: "Andy" });
    expect(game.reset).not.toHaveBeenCalled();
  });

  it("next without a room to keep falls back to hosting fresh", async () => {
    renderPicker("next");
    pickMidi();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/host-game/name", { replace: true }));
    expect(createNextGame).not.toHaveBeenCalled();
  });

  it("shows an error and re-enables the buttons when setting up fails", async () => {
    mp.shareCode = "ABCDEF";
    uploadPuzzle.mockResolvedValueOnce(null as unknown as string);
    renderPicker("next");
    pickMidi();
    await screen.findByRole("alert");
    expect(screen.getAllByRole("button", { name: "Pick" }).every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});
