// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameProvider, useGame } from "./GameContext";
import { SAMPLE_PUZZLES } from "../lib/samplePuzzles";
import { puzzleIdentity } from "../lib/soloStats";
import { PROGRESS_KEY, getProgress, loadProgressStore } from "../lib/soloProgress";

const services = vi.hoisted(() => ({ uploadPuzzle: vi.fn(), createGame: vi.fn(), updateGame: vi.fn() }));
vi.mock("./AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../lib/puzzleService", () => services);

let game: ReturnType<typeof useGame>;
function Probe() {
  game = useGame();
  return null;
}
const first = SAMPLE_PUZZLES[0].puzzle;
const second = SAMPLE_PUZZLES[1].puzzle;
const firstLetter = first.cells.flat().find((c) => c.solution !== null)!;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("per-puzzle solo progress (GameContext)", () => {
  it("records a started puzzle, keeps it when another puzzle is loaded, and hydrates it when it comes back", async () => {
    render(
      <GameProvider>
        <Probe />
      </GameProvider>,
    );
    await act(async () => {
      await game.handleSoloPuzzleLoaded(first);
    });
    // Even an untouched grid can be paused and resumed.
    expect(loadProgressStore()[puzzleIdentity(first)]).toMatchObject({ filled: 0, puzzle: first });

    await act(async () => {
      game.selectCell(firstLetter.row, firstLetter.col);
      game.inputLetter(firstLetter.solution!);
    });
    const key = puzzleIdentity(first);
    expect(getProgress(key)).toMatchObject({ filled: 1 });

    // Switch puzzles: the first one's record survives.
    await act(async () => {
      await game.handleSoloPuzzleLoaded(second);
    });
    expect(game.puzzle?.title).toBe(second.title);
    expect(Object.keys(game.playerCells)).toHaveLength(0);
    expect(getProgress(key)).toMatchObject({ filled: 1 });

    // Coming back hydrates the typed letter and its score.
    await act(async () => {
      await game.handleSoloPuzzleLoaded(first);
    });
    expect(game.playerCells[`${firstLetter.row},${firstLetter.col}`]?.letter).toBe(firstLetter.solution);
    expect(game.score).toBe(1);
  });

  it("deletes the record when the puzzle is finished", async () => {
    render(
      <GameProvider>
        <Probe />
      </GameProvider>,
    );
    await act(async () => {
      await game.handleSoloPuzzleLoaded(first);
    });
    const white = first.cells.flat().filter((c) => c.solution !== null);
    // Fill every cell but the last, then the last: a record exists in between and is gone at the end.
    await act(async () => {
      for (const c of white.slice(0, -1)) {
        game.selectCell(c.row, c.col);
        game.inputLetter(c.solution!);
      }
    });
    expect(getProgress(puzzleIdentity(first))).not.toBeNull();
    await act(async () => {
      const last = white[white.length - 1];
      game.selectCell(last.row, last.col);
      game.inputLetter(last.solution!);
    });
    expect(game.isComplete).toBe(true);
    expect(getProgress(puzzleIdentity(first))).toBeNull();
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
  });
});

describe("resumable attempts", () => {
  it("persists selection, direction, wrong letters, theme, and free-typing history across reload", async () => {
    const view = render(<GameProvider><Probe /></GameProvider>);
    await act(async () => { await game.handleSoloPuzzleLoaded(first); });
    act(() => {
      game.dispatch({ type: "SET_AUTOCHECK", autocheck: false });
      game.selectCell(firstLetter.row, firstLetter.col);
      game.inputLetter("Z");
      game.setDirection("down");
      game.setSoloTheme("Test theme");
    });
    const selection = game.selectedCell;
    expect(getProgress(puzzleIdentity(first))?.usedFreeTyping).toBe(true);
    view.unmount();
    render(<GameProvider><Probe /></GameProvider>);
    expect(game.playerCells[`${firstLetter.row},${firstLetter.col}`]?.letter).toBe("Z");
    expect(game.selectedCell).toEqual(selection);
    expect(game.direction).toBe("down");
    expect(game.soloTheme).toBe("Test theme");
  });

  it("refuses to switch if the outgoing attempt cannot be saved", async () => {
    render(<GameProvider><Probe /></GameProvider>);
    await act(async () => { await game.handleSoloPuzzleLoaded(first); });
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    act(() => { game.selectCell(firstLetter.row, firstLetter.col); game.inputLetter(firstLetter.solution!); });
    await act(async () => { expect(await game.handleSoloPuzzleLoaded(second)).toBe(false); });
    expect(game.puzzle).toEqual(first);
    expect(game.playerCells[`${firstLetter.row},${firstLetter.col}`]?.letter).toBe(firstLetter.solution);
    expect(game.soloSaveError).toBe("storage");
    write.mockRestore();
    act(() => { expect(game.checkpointSolo()).toBe("saved"); });
    expect(game.soloSaveError).toBeNull();
  });
});
