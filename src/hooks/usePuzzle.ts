import { useReducer, useMemo, useCallback } from "react";
import type {
  Puzzle,
  CellState,
  CellCoord,
  Direction,
  PuzzleClue,
} from "../types/puzzle";
import {
  getWordCells,
  getClueForCell,
  getPrevCell,
  getNextWordStart,
  getPrevWordStart,
  isBlack,
} from "../lib/gridUtils";

// --- State ---

export interface PuzzleState {
  puzzle: Puzzle | null;
  /** Map of "row,col" → CellState */
  playerCells: Record<string, CellState>;
  selectedCell: CellCoord | null;
  direction: Direction;
  score: number;
  totalWhiteCells: number;
}

export const initialState: PuzzleState = {
  puzzle: null,
  playerCells: {},
  selectedCell: null,
  direction: "across",
  score: 0,
  totalWhiteCells: 0,
};

// --- Actions ---

export type PuzzleAction =
  | { type: "LOAD_PUZZLE"; puzzle: Puzzle }
  | { type: "RESET" }
  | { type: "SELECT_CELL"; row: number; col: number }
  | { type: "TOGGLE_DIRECTION" }
  | { type: "SET_DIRECTION"; direction: Direction }
  | { type: "INPUT_LETTER"; letter: string; playerId?: string }
  | { type: "DELETE_LETTER" }
  | { type: "MOVE_SELECTION"; dr: number; dc: number }
  | { type: "NEXT_WORD" }
  | { type: "PREV_WORD" }
  | { type: "REMOTE_CELL_CLAIM"; row: number; col: number; letter: string; playerId: string }
  | { type: "HYDRATE_CELLS"; cells: Record<string, CellState>; score: number }
  | { type: "ROLLBACK_CELL"; row: number; col: number; playerId: string };

// --- Helpers ---

/**
 * After placing or skipping a letter at (row, col), advance the cursor:
 * 1. Skip to the next empty cell in the current word
 * 2. If the word is complete, jump to the first empty cell of the next word
 * Returns null if there's nowhere to advance (puzzle complete).
 */
function advanceCursor(
  puzzle: Puzzle,
  playerCells: Record<string, CellState>,
  row: number,
  col: number,
  direction: Direction,
): { coord: CellCoord; direction: Direction } | null {
  // Walk forward through the current word, skipping filled cells
  const wordCells = getWordCells(puzzle, row, col, direction);
  const currentIdx = wordCells.findIndex((c) => c.row === row && c.col === col);
  for (let i = currentIdx + 1; i < wordCells.length; i++) {
    const c = wordCells[i];
    if (!playerCells[`${c.row},${c.col}`]?.correct) {
      return { coord: c, direction };
    }
  }

  // Current word is complete — find next word with empty cells
  const allClues = [...puzzle.clues].sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === direction ? -1 : 1;
    return a.number - b.number;
  });
  const currentClue = getClueForCell(puzzle, row, col, direction);
  const startIdx = currentClue
    ? allClues.findIndex(
        (c) => c.direction === currentClue.direction && c.number === currentClue.number,
      )
    : -1;

  for (let offset = 1; offset <= allClues.length; offset++) {
    const clue = allClues[(startIdx + offset) % allClues.length];
    const cells = getWordCells(puzzle, clue.row, clue.col, clue.direction);
    const firstEmpty = cells.find((c) => !playerCells[`${c.row},${c.col}`]?.correct);
    if (firstEmpty) {
      return { coord: firstEmpty, direction: clue.direction };
    }
  }

  return null;
}

// --- Reducer ---

function countWhiteCells(puzzle: Puzzle): number {
  let count = 0;
  for (const row of puzzle.cells) {
    for (const cell of row) {
      if (cell.solution !== null) count++;
    }
  }
  return count;
}

export function puzzleReducer(state: PuzzleState, action: PuzzleAction): PuzzleState {
  switch (action.type) {
    case "LOAD_PUZZLE": {
      const puzzle = action.puzzle;
      // Select the first white cell
      let firstCell: CellCoord | null = null;
      for (let r = 0; r < puzzle.height && !firstCell; r++) {
        for (let c = 0; c < puzzle.width && !firstCell; c++) {
          if (!isBlack(puzzle, r, c)) {
            firstCell = { row: r, col: c };
          }
        }
      }
      return {
        ...state,
        puzzle,
        playerCells: {},
        selectedCell: firstCell,
        direction: "across",
        score: 0,
        totalWhiteCells: countWhiteCells(puzzle),
      };
    }

    case "RESET":
      return initialState;

    case "SELECT_CELL": {
      if (!state.puzzle || isBlack(state.puzzle, action.row, action.col)) {
        return state;
      }
      // If clicking the already-selected cell, toggle direction
      if (
        state.selectedCell?.row === action.row &&
        state.selectedCell?.col === action.col
      ) {
        return { ...state, direction: state.direction === "across" ? "down" : "across" };
      }
      return {
        ...state,
        selectedCell: { row: action.row, col: action.col },
      };
    }

    case "TOGGLE_DIRECTION": {
      return {
        ...state,
        direction: state.direction === "across" ? "down" : "across",
      };
    }

    case "SET_DIRECTION": {
      return { ...state, direction: action.direction };
    }

    case "INPUT_LETTER": {
      if (!state.puzzle || !state.selectedCell) return state;
      const { row, col } = state.selectedCell;
      const cell = state.puzzle.cells[row][col];
      if (cell.solution === null) return state;

      const key = `${row},${col}`;
      const letter = action.letter.toUpperCase();

      // Already correctly filled — advance to next empty cell or next word
      if (state.playerCells[key]?.correct) {
        const next = advanceCursor(state.puzzle, state.playerCells, row, col, state.direction);
        return next
          ? { ...state, selectedCell: next.coord, direction: next.direction }
          : state;
      }

      const correct = letter === cell.solution;
      if (!correct) {
        // Incorrect letter — silently reject (don't place it)
        return state;
      }

      // Correct letter — place it and advance
      const newCells = {
        ...state.playerCells,
        [key]: { letter, correct: true, playerId: action.playerId },
      };
      const newScore = state.score + 1;
      const next = advanceCursor(state.puzzle, newCells, row, col, state.direction);
      return {
        ...state,
        playerCells: newCells,
        score: newScore,
        selectedCell: next?.coord ?? state.selectedCell,
        direction: next?.direction ?? state.direction,
      };
    }

    case "DELETE_LETTER": {
      if (!state.puzzle || !state.selectedCell) return state;
      const { row, col } = state.selectedCell;
      const key = `${row},${col}`;

      // If current cell has a letter, delete it
      if (state.playerCells[key]) {
        const newCells = { ...state.playerCells };
        delete newCells[key];
        return {
          ...state,
          playerCells: newCells,
          score: state.score - 1,
        };
      }

      // Otherwise, move back and delete that cell
      const prev = getPrevCell(state.puzzle, row, col, state.direction);
      if (prev) {
        const prevKey = `${prev.row},${prev.col}`;
        if (state.playerCells[prevKey]) {
          const newCells = { ...state.playerCells };
          delete newCells[prevKey];
          return {
            ...state,
            playerCells: newCells,
            score: state.score - 1,
            selectedCell: prev,
          };
        }
        return { ...state, selectedCell: prev };
      }
      return state;
    }

    case "MOVE_SELECTION": {
      if (!state.puzzle || !state.selectedCell) return state;
      const nr = state.selectedCell.row + action.dr;
      const nc = state.selectedCell.col + action.dc;
      if (
        nr < 0 ||
        nr >= state.puzzle.height ||
        nc < 0 ||
        nc >= state.puzzle.width
      ) {
        return state;
      }
      if (isBlack(state.puzzle, nr, nc)) return state;

      // Update direction to match movement
      const newDir: Direction =
        action.dr !== 0 ? "down" : action.dc !== 0 ? "across" : state.direction;

      return {
        ...state,
        selectedCell: { row: nr, col: nc },
        direction: newDir,
      };
    }

    case "NEXT_WORD": {
      if (!state.puzzle || !state.selectedCell) return state;
      const { coord, direction } = getNextWordStart(
        state.puzzle,
        state.selectedCell.row,
        state.selectedCell.col,
        state.direction,
      );
      return { ...state, selectedCell: coord, direction };
    }

    case "PREV_WORD": {
      if (!state.puzzle || !state.selectedCell) return state;
      const { coord, direction } = getPrevWordStart(
        state.puzzle,
        state.selectedCell.row,
        state.selectedCell.col,
        state.direction,
      );
      return { ...state, selectedCell: coord, direction };
    }

    case "REMOTE_CELL_CLAIM": {
      if (!state.puzzle) return state;
      const key = `${action.row},${action.col}`;
      // Already filled locally — ignore
      if (state.playerCells[key]?.correct) return state;
      const newCells = {
        ...state.playerCells,
        [key]: { letter: action.letter, correct: true, playerId: action.playerId },
      };
      return {
        ...state,
        playerCells: newCells,
        score: state.score + 1,
      };
    }

    case "HYDRATE_CELLS": {
      return {
        ...state,
        playerCells: action.cells,
        score: action.score,
      };
    }

    case "ROLLBACK_CELL": {
      const key = `${action.row},${action.col}`;
      const existing = state.playerCells[key];
      // Only rollback if it was our optimistic write
      if (!existing || existing.playerId !== action.playerId) return state;
      const newCells = { ...state.playerCells };
      delete newCells[key];
      return {
        ...state,
        playerCells: newCells,
        score: state.score - 1,
      };
    }

    default:
      return state;
  }
}

// --- Hook ---

export function usePuzzle() {
  const [state, dispatch] = useReducer(puzzleReducer, initialState);

  const highlightedCells = useMemo(() => {
    if (!state.puzzle || !state.selectedCell) return new Set<string>();
    const cells = getWordCells(
      state.puzzle,
      state.selectedCell.row,
      state.selectedCell.col,
      state.direction,
    );
    return new Set(cells.map((c) => `${c.row},${c.col}`));
  }, [state.puzzle, state.selectedCell, state.direction]);

  const activeClue = useMemo((): PuzzleClue | null => {
    if (!state.puzzle || !state.selectedCell) return null;
    return getClueForCell(
      state.puzzle,
      state.selectedCell.row,
      state.selectedCell.col,
      state.direction,
    );
  }, [state.puzzle, state.selectedCell, state.direction]);

  const isComplete = state.totalWhiteCells > 0 && state.score === state.totalWhiteCells;

  const loadPuzzle = useCallback(
    (puzzle: Puzzle) => dispatch({ type: "LOAD_PUZZLE", puzzle }),
    [],
  );
  const selectCell = useCallback(
    (row: number, col: number) => dispatch({ type: "SELECT_CELL", row, col }),
    [],
  );
  const toggleDirection = useCallback(
    () => dispatch({ type: "TOGGLE_DIRECTION" }),
    [],
  );
  const setDirection = useCallback(
    (direction: Direction) => dispatch({ type: "SET_DIRECTION", direction }),
    [],
  );
  const inputLetter = useCallback(
    (letter: string, playerId?: string) =>
      dispatch({ type: "INPUT_LETTER", letter, playerId }),
    [],
  );
  const deleteLetter = useCallback(
    () => dispatch({ type: "DELETE_LETTER" }),
    [],
  );
  const moveSelection = useCallback(
    (dr: number, dc: number) => dispatch({ type: "MOVE_SELECTION", dr, dc }),
    [],
  );
  const nextWord = useCallback(() => dispatch({ type: "NEXT_WORD" }), []);
  const prevWord = useCallback(() => dispatch({ type: "PREV_WORD" }), []);
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  return {
    ...state,
    dispatch,
    highlightedCells,
    activeClue,
    isComplete,
    loadPuzzle,
    selectCell,
    toggleDirection,
    setDirection,
    inputLetter,
    deleteLetter,
    moveSelection,
    nextWord,
    prevWord,
    reset,
  };
}
