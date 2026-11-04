// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameProvider, useGame } from "./GameContext";

/**
 * The `?join=` code the page was opened with is handed to the join screen
 * once (Andrew, 2026-11-03: kept for the page's life, it prefilled every
 * later visit to Join with the first invite's code, a finished room).
 */
vi.mock("./AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../lib/puzzleService", () => ({ uploadPuzzle: vi.fn(), createGame: vi.fn(), updateGame: vi.fn() }));

let game: ReturnType<typeof useGame>;
function Probe() {
  game = useGame();
  return null;
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("GameContext initialJoinCode", () => {
  it("reads the page's ?join= code once and forgets it when the join screen consumes it", () => {
    window.history.replaceState({}, "", "/?join=badecn");
    render(
      <GameProvider>
        <Probe />
      </GameProvider>,
    );
    expect(game.initialJoinCode).toBe("BADECN");
    expect(game.hasJoinCode).toBe(true);
    act(() => game.consumeInitialJoinCode());
    expect(game.initialJoinCode).toBeNull();
    expect(game.hasJoinCode).toBe(false);
  });

  it("has no code without the parameter", () => {
    render(
      <GameProvider>
        <Probe />
      </GameProvider>,
    );
    expect(game.initialJoinCode).toBeNull();
  });
});
