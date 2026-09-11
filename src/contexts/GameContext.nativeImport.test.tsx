// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameProvider, useGame } from "./GameContext";
import { SAMPLE_PUZZLES } from "../lib/samplePuzzles";
import type { Puzzle } from "../types/puzzle";

const services = vi.hoisted(() => ({ uploadPuzzle: vi.fn(), createGame: vi.fn(), updateGame: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { id: "local-test-user" } }));
vi.mock("./AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../lib/puzzleService", () => services);

let game: ReturnType<typeof useGame>;
function Probe() { game = useGame(); return null; }
const imported: Puzzle = { ...SAMPLE_PUZZLES[0].puzzle,
  source: { provider: "nyt", kind: "daily", date: "2026-09-10", url: "https://www.nytimes.com/crosswords/game/daily/2026/09/10" } };

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); });
afterEach(cleanup);

describe("native subscriber import persistence", () => {
  it("keeps solo imports and letter changes local, even after an existing server game", async () => {
    render(<GameProvider><Probe /></GameProvider>);
    await act(async () => { game.setGameId("previous-game"); });
    services.updateGame.mockClear();
    await act(async () => { await game.handleSoloPuzzleLoaded(imported); });
    expect(game.gameId).toBeNull();
    expect(game.isMultiplayer).toBe(false);
    await act(async () => { game.inputLetter("A"); });
    expect(services.uploadPuzzle).not.toHaveBeenCalled();
    expect(services.createGame).not.toHaveBeenCalled();
    expect(services.updateGame).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("crossword-clash-solo")!).puzzle.source).toEqual(imported.source);
  });

  it("does not sync a restored subscriber puzzle with a stale game id", async () => {
    localStorage.setItem("crossword-clash-solo", JSON.stringify({ puzzle: imported, playerCells: {}, gameId: "stale" }));
    render(<GameProvider><Probe /></GameProvider>);
    await waitFor(() => expect(game.puzzle?.source).toEqual(imported.source));
    expect(services.uploadPuzzle).not.toHaveBeenCalled();
    // No write should run on the initial null-puzzle render either.
    expect(services.updateGame).not.toHaveBeenCalled();
  });
});
