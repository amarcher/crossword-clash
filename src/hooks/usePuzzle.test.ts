import { describe, it, expect } from "vitest";
import { puzzleReducer, initialState } from "./usePuzzle";
import type { PuzzleState } from "./usePuzzle";
import type { Puzzle } from "../types/puzzle";

function makeTestPuzzle(): Puzzle {
  return {
    title: "Test",
    author: "Test",
    width: 3,
    height: 3,
    cells: [
      [
        { row: 0, col: 0, solution: "C", number: 1 },
        { row: 0, col: 1, solution: "A" },
        { row: 0, col: 2, solution: "T", number: 2 },
      ],
      [
        { row: 1, col: 0, solution: "A" },
        { row: 1, col: 1, solution: null },
        { row: 1, col: 2, solution: "O" },
      ],
      [
        { row: 2, col: 0, solution: "B", number: 3 },
        { row: 2, col: 1, solution: "E" },
        { row: 2, col: 2, solution: "T" },
      ],
    ],
    clues: [
      { direction: "across", number: 1, text: "Feline", row: 0, col: 0, length: 3, answer: "CAT" },
      { direction: "across", number: 3, text: "Wager", row: 2, col: 0, length: 3, answer: "BET" },
      { direction: "down", number: 1, text: "Taxi", row: 0, col: 0, length: 3, answer: "CAB" },
      { direction: "down", number: 2, text: "Digit", row: 0, col: 2, length: 3, answer: "TOT" },
    ],
  };
}

function loadedState(): PuzzleState {
  return puzzleReducer(initialState, {
    type: "LOAD_PUZZLE",
    puzzle: makeTestPuzzle(),
  });
}

describe("puzzleReducer", () => {
  describe("LOAD_PUZZLE", () => {
    it("sets puzzle and selects first white cell", () => {
      const state = loadedState();
      expect(state.puzzle).not.toBeNull();
      expect(state.selectedCell).toEqual({ row: 0, col: 0 });
      expect(state.direction).toBe("across");
      expect(state.score).toBe(0);
      expect(state.totalWhiteCells).toBe(8);
    });
  });

  describe("RESET", () => {
    it("returns to initial state", () => {
      const state = puzzleReducer(loadedState(), { type: "RESET" });
      expect(state.puzzle).toBeNull();
      expect(state.selectedCell).toBeNull();
    });
  });

  describe("SELECT_CELL", () => {
    it("selects a white cell", () => {
      const state = puzzleReducer(loadedState(), {
        type: "SELECT_CELL",
        row: 2,
        col: 1,
      });
      expect(state.selectedCell).toEqual({ row: 2, col: 1 });
    });

    it("ignores black cells", () => {
      const before = loadedState();
      const state = puzzleReducer(before, {
        type: "SELECT_CELL",
        row: 1,
        col: 1,
      });
      expect(state.selectedCell).toEqual(before.selectedCell);
    });

    it("toggles direction when clicking same cell", () => {
      const state = puzzleReducer(loadedState(), {
        type: "SELECT_CELL",
        row: 0,
        col: 0,
      });
      expect(state.direction).toBe("down");
    });
  });

  describe("INPUT_LETTER", () => {
    it("places correct letter and advances cursor", () => {
      const state = puzzleReducer(loadedState(), {
        type: "INPUT_LETTER",
        letter: "c",
      });
      expect(state.playerCells["0,0"]).toEqual({
        letter: "C",
        correct: true,
        playerId: undefined,
      });
      expect(state.score).toBe(1);
      expect(state.selectedCell).toEqual({ row: 0, col: 1 });
    });

    it("rejects incorrect letter silently", () => {
      const before = loadedState();
      const state = puzzleReducer(before, {
        type: "INPUT_LETTER",
        letter: "z",
      });
      expect(state.playerCells["0,0"]).toBeUndefined();
      expect(state.score).toBe(0);
      expect(state.selectedCell).toEqual(before.selectedCell);
    });

    it("stores playerId when provided", () => {
      const state = puzzleReducer(loadedState(), {
        type: "INPUT_LETTER",
        letter: "c",
        playerId: "player-1",
      });
      expect(state.playerCells["0,0"]?.playerId).toBe("player-1");
    });

    it("skips already-filled cells and advances", () => {
      let state = loadedState();
      state = puzzleReducer(state, { type: "INPUT_LETTER", letter: "c" });
      // Now cursor is at (0,1), go back to (0,0)
      state = puzzleReducer(state, { type: "SELECT_CELL", row: 0, col: 0 });
      // Try to type again on already-filled cell
      state = puzzleReducer(state, { type: "INPUT_LETTER", letter: "c" });
      expect(state.selectedCell).toEqual({ row: 0, col: 1 });
      expect(state.score).toBe(1); // score didn't increase
    });
  });

  describe("DELETE_LETTER", () => {
    it("deletes letter at current cell", () => {
      let state = loadedState();
      state = puzzleReducer(state, { type: "INPUT_LETTER", letter: "c" });
      // Cursor is now at (0,1), go back
      state = puzzleReducer(state, { type: "SELECT_CELL", row: 0, col: 0 });
      state = puzzleReducer(state, { type: "DELETE_LETTER" });
      expect(state.playerCells["0,0"]).toBeUndefined();
      expect(state.score).toBe(0);
    });
  });

  describe("REMOTE_CELL_CLAIM", () => {
    it("places a remote player's letter", () => {
      const state = puzzleReducer(loadedState(), {
        type: "REMOTE_CELL_CLAIM",
        row: 2,
        col: 0,
        letter: "B",
        playerId: "remote-player",
      });
      expect(state.playerCells["2,0"]).toEqual({
        letter: "B",
        correct: true,
        playerId: "remote-player",
      });
      expect(state.score).toBe(1);
    });

    it("ignores if cell already filled", () => {
      let state = loadedState();
      state = puzzleReducer(state, { type: "INPUT_LETTER", letter: "c" });
      const before = state;
      state = puzzleReducer(state, {
        type: "REMOTE_CELL_CLAIM",
        row: 0,
        col: 0,
        letter: "C",
        playerId: "remote-player",
      });
      expect(state.playerCells["0,0"]).toEqual(before.playerCells["0,0"]);
      expect(state.score).toBe(before.score);
    });
  });

  describe("HYDRATE_CELLS", () => {
    it("bulk-loads cells and score", () => {
      const cells = {
        "0,0": { letter: "C", correct: true, playerId: "p1" },
        "0,1": { letter: "A", correct: true, playerId: "p2" },
      };
      const state = puzzleReducer(loadedState(), {
        type: "HYDRATE_CELLS",
        cells,
        score: 2,
      });
      expect(state.playerCells).toEqual(cells);
      expect(state.score).toBe(2);
    });
  });

  describe("ROLLBACK_CELL", () => {
    it("removes an optimistic cell claim", () => {
      let state = loadedState();
      state = puzzleReducer(state, {
        type: "INPUT_LETTER",
        letter: "c",
        playerId: "my-id",
      });
      expect(state.playerCells["0,0"]).toBeDefined();

      state = puzzleReducer(state, {
        type: "ROLLBACK_CELL",
        row: 0,
        col: 0,
        playerId: "my-id",
      });
      expect(state.playerCells["0,0"]).toBeUndefined();
      expect(state.score).toBe(0);
    });

    it("does not rollback if playerId doesn't match", () => {
      let state = loadedState();
      state = puzzleReducer(state, {
        type: "INPUT_LETTER",
        letter: "c",
        playerId: "my-id",
      });

      state = puzzleReducer(state, {
        type: "ROLLBACK_CELL",
        row: 0,
        col: 0,
        playerId: "other-id",
      });
      expect(state.playerCells["0,0"]).toBeDefined();
      expect(state.score).toBe(1);
    });
  });

  describe("MOVE_SELECTION", () => {
    it("moves cursor down", () => {
      const state = puzzleReducer(loadedState(), {
        type: "MOVE_SELECTION",
        dr: 1,
        dc: 0,
      });
      expect(state.selectedCell).toEqual({ row: 1, col: 0 });
      expect(state.direction).toBe("down");
    });

    it("does not move into black cells", () => {
      let state = loadedState();
      state = puzzleReducer(state, { type: "SELECT_CELL", row: 1, col: 0 });
      state = puzzleReducer(state, { type: "MOVE_SELECTION", dr: 0, dc: 1 });
      // (1,1) is black, should stay at (1,0)
      expect(state.selectedCell).toEqual({ row: 1, col: 0 });
    });

    it("does not move out of bounds", () => {
      const state = puzzleReducer(loadedState(), {
        type: "MOVE_SELECTION",
        dr: -1,
        dc: 0,
      });
      expect(state.selectedCell).toEqual({ row: 0, col: 0 });
    });
  });
});
