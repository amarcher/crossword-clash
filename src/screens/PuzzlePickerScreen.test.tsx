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
  gameId: null as string | null,
  displayName: "Andy",
  reset: vi.fn(),
  loadPuzzle: vi.fn(),
  setGameId: vi.fn(),
  setIsMultiplayer: vi.fn(),
  setUrlPuzzle: vi.fn(),
  setCompletionModalDismissed: vi.fn(),
};
vi.mock("../contexts/GameContext", () => ({ useGame: () => game, STORAGE_KEY: "crossword-clash-solo" }));

const mp = { shareCode: null as string | null, isHost: false, broadcastNewGame: vi.fn() };
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

// Past dailies nobody about to play has finished (useFreshPuzzles), per size and room.
const freshEntry = { day: "2026-10-30", slot: "midi" as const, title: "Night Shift", theme: "Jobs", author: "", width: 9, height: 9, clues: 30, identity: "k-night", blocks: ".#/.." };
const useFreshPuzzles = vi.fn((slot: string, _gameId: string | null) => (slot === "midi" ? [freshEntry] : []));
vi.mock("../hooks/useFreshPuzzles", () => ({ useFreshPuzzles: (slot: string, gameId: string | null) => useFreshPuzzles(slot, gameId) }));
const fetchDailyForDay = vi.fn(async (_day: string, _slot: string) => midi as unknown);
vi.mock("../lib/dailyFeed", async (original) => ({
  ...(await original<typeof import("../lib/dailyFeed")>()),
  fetchDailyForDay: (day: string, slot: string) => fetchDailyForDay(day, slot),
}));

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
  game.gameId = null;
  mp.shareCode = null;
  mp.isHost = false;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PuzzlePickerScreen", () => {
  it("offers past dailies of the chosen size that nobody in the room has finished, and picks one for the room", async () => {
    game.gameId = "game-1";
    mp.shareCode = "ABCDEF";
    mp.isHost = true;
    renderPicker("next");
    const section = screen.getByRole("region", { name: "New to everyone here" });
    expect(useFreshPuzzles).toHaveBeenLastCalledWith("midi", "game-1");
    fireEvent.click(within(within(section).getByText("Night Shift").closest("li")!).getByRole("button", { name: "Pick" }));
    await waitFor(() => expect(createNextGame).toHaveBeenCalled());
    expect(fetchDailyForDay).toHaveBeenCalledWith("2026-10-30", "midi");

    // Another size asks again; with none left the switch stays.
    fireEvent.click(within(section).getByRole("radio", { name: "Large" }));
    expect(useFreshPuzzles).toHaveBeenLastCalledWith("large", "game-1");
    expect(within(section).getByText("None left in this size")).toBeTruthy();
    expect(within(section).getByRole("radio", { name: "Mini" })).toBeTruthy();
  });

  it("with no room to keep, asks only about the player", () => {
    renderPicker("race");
    expect(screen.getByRole("region", { name: "New to you" })).toBeTruthy();
    expect(useFreshPuzzles).toHaveBeenLastCalledWith("midi", null);
  });

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
    game.gameId = "game-1";
    mp.shareCode = "ABCDEF";
    mp.isHost = true;
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

  it("next with a code left over from a room this player does not host falls back too", async () => {
    // The code of a room someone else closed, or of a room this player merely joined.
    mp.shareCode = "ABCDEF";
    renderPicker("next");
    pickMidi();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/host-game/name", { replace: true }));
    expect(createNextGame).not.toHaveBeenCalled();
    expect(clearMpSession).toHaveBeenCalled();
  });

  it("shows an error and re-enables the buttons when setting up fails", async () => {
    game.gameId = "game-1";
    mp.shareCode = "ABCDEF";
    mp.isHost = true;
    uploadPuzzle.mockResolvedValueOnce(null as unknown as string);
    renderPicker("next");
    pickMidi();
    await screen.findByRole("alert");
    expect(screen.getAllByRole("button", { name: "Pick" }).every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});
