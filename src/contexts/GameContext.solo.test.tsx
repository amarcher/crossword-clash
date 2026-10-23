// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameProvider, useGame } from "./GameContext";
import { SAMPLE_PUZZLES } from "../lib/samplePuzzles";
import { puzzleIdentity } from "../lib/soloStats";
import { getProgress } from "../lib/soloProgress";

const services = vi.hoisted(() => ({ uploadPuzzle: vi.fn(), createGame: vi.fn() }));
const client = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("./AuthContext", () => ({ useAuth: () => ({ user: { id: "signed-in-user" } }) }));
vi.mock("../lib/puzzleService", () => services);
vi.mock("../lib/supabaseClient", () => ({ supabase: client }));

let game: ReturnType<typeof useGame>;
function Probe() {
  game = useGame();
  return null;
}
const puzzle = SAMPLE_PUZZLES[0].puzzle;
const white = puzzle.cells.flat().filter((c) => c.solution !== null);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("solo play writes no server rows", () => {
  it("loads, plays and finishes a solo puzzle with a signed-in user without touching puzzles, games or players", async () => {
    render(
      <GameProvider>
        <Probe />
      </GameProvider>,
    );
    await act(async () => {
      await game.handleSoloPuzzleLoaded(puzzle);
    });
    expect(game.gameId).toBeNull();

    await act(async () => {
      for (const c of white) {
        game.selectCell(c.row, c.col);
        game.inputLetter(c.solution!);
      }
    });
    expect(game.isComplete).toBe(true);

    expect(services.uploadPuzzle).not.toHaveBeenCalled();
    expect(services.createGame).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
    // Local persistence still runs: the resumable session is saved and the
    // per-puzzle record is gone once the grid is complete.
    expect(JSON.parse(localStorage.getItem("crossword-clash-solo")!).puzzle.title).toBe(puzzle.title);
    expect(getProgress(puzzleIdentity(puzzle))).toBeNull();
  });

  it("never writes to a game id left over from a room", async () => {
    render(
      <GameProvider>
        <Probe />
      </GameProvider>,
    );
    await act(async () => {
      game.setGameId("room-game");
    });
    await act(async () => {
      await game.handleSoloPuzzleLoaded(puzzle);
    });
    expect(game.gameId).toBeNull();
    await act(async () => {
      game.selectCell(white[0].row, white[0].col);
      game.inputLetter(white[0].solution!);
    });
    expect(client.from).not.toHaveBeenCalled();
  });
});
