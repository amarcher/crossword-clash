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
  getCompletedClues,
  getFilledClues,
  isBlack,
} from "../lib/gridUtils";

// --- State ---

export interface PuzzleState {
  puzzle: Puzzle | null;
  /** Map of "row,col" → CellState */
  playerCells: Record<string, CellState>;
  selectedCell: CellCoord | null;
  direction: Direction;
  /** Correct letters in the grid (not letters typed): `isComplete` is score === totalWhiteCells. */
  score: number;
  totalWhiteCells: number;
  /**
   * Solo Autocheck (src/lib/soloSettings.ts). On, INPUT_LETTER refuses a wrong
   * letter and a square counts as filled only when correct; off, any letter is
   * written as typed, a square with a letter counts as filled for the cursor
   * and the clue list (so nothing leaks which ones are wrong), and CHECK_CELLS
   * / REVEAL_CELL do the judging. Always on in a room. Set by SET_AUTOCHECK and
   * kept across LOAD_PUZZLE and RESET.
   */
  autocheck: boolean;
}

export const initialState: PuzzleState = {
  puzzle: null,
  playerCells: {},
  selectedCell: null,
  direction: "across",
  score: 0,
  totalWhiteCells: 0,
  autocheck: true,
};

// --- Actions ---

export type PuzzleAction =
  | { type: "LOAD_PUZZLE"; puzzle: Puzzle }
  | { type: "RESET" }
  | { type: "SELECT_CELL"; row: number; col: number }
  | { type: "TOGGLE_DIRECTION" }
  | { type: "SET_DIRECTION"; direction: Direction }
  | { type: "INPUT_LETTER"; letter: string; playerId?: string; at?: number }
  | { type: "DELETE_LETTER" }
  | { type: "MOVE_SELECTION"; dr: number; dc: number }
  | { type: "NEXT_WORD" }
  | { type: "PREV_WORD" }
  | { type: "REMOTE_CELL_CLAIM"; row: number; col: number; letter: string; playerId: string; at?: number }
  | { type: "HYDRATE_CELLS"; cells: Record<string, CellState>; score: number }
  | { type: "ROLLBACK_CELL"; row: number; col: number; playerId: string }
  | { type: "SET_AUTOCHECK"; autocheck: boolean }
  /** Mark the wrong letters among `cells` (`checked: "wrong"`); correct and empty squares are left alone. */
  | { type: "CHECK_CELLS"; cells: CellCoord[] }
  /** Write the solution into one square and lock it (`revealed`). The cursor stays. */
  | { type: "REVEAL_CELL"; row: number; col: number; at?: number };

// --- Helpers ---

/**
 * Whether the cursor should skip the square at `key`: a correct letter under
 * autocheck (the only kind that exists then), any letter without it — a solver
 * typing freely must not learn which squares are wrong from where the cursor
 * lands.
 */
function occupied(cells: Record<string, CellState>, key: string, autocheck: boolean): boolean {
  const c = cells[key];
  // A square a check has judged wrong is known to need a letter.
  return autocheck ? !!c?.correct : !!c?.letter && c.checked !== "wrong";
}

/**
 * The direction the cursor should take at (row, col) when it wants `wanted`.
 * A square that belongs to only one word (common in older puzzles and in
 * British grids, never in standard American ones) has a single-cell "word" in
 * the other direction; landing there in that direction leaves a one-cell
 * highlight and no clue. Flip to the real word instead.
 */
function settleDirection(
  puzzle: Puzzle,
  row: number,
  col: number,
  wanted: Direction,
): Direction {
  const other: Direction = wanted === "across" ? "down" : "across";
  if (
    getWordCells(puzzle, row, col, wanted).length === 1 &&
    getWordCells(puzzle, row, col, other).length > 1
  ) {
    return other;
  }
  return wanted;
}

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
  autocheck: boolean,
): { coord: CellCoord; direction: Direction } | null {
  // Walk forward through the current word, skipping filled cells
  const wordCells = getWordCells(puzzle, row, col, direction);
  const currentIdx = wordCells.findIndex((c) => c.row === row && c.col === col);
  for (let i = currentIdx + 1; i < wordCells.length; i++) {
    const c = wordCells[i];
    if (!occupied(playerCells, `${c.row},${c.col}`, autocheck)) {
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
    const firstEmpty = cells.find((c) => !occupied(playerCells, `${c.row},${c.col}`, autocheck));
    if (firstEmpty) {
      return {
        coord: firstEmpty,
        direction: settleDirection(puzzle, firstEmpty.row, firstEmpty.col, clue.direction),
      };
    }
  }

  // Without autocheck a full grid is still being edited (the solver may be
  // retyping an entry they doubt), so step along the word instead of freezing.
  if (!autocheck && currentIdx >= 0 && currentIdx + 1 < wordCells.length) {
    return { coord: wordCells[currentIdx + 1], direction };
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
        direction: firstCell
          ? settleDirection(puzzle, firstCell.row, firstCell.col, "across")
          : "across",
        score: 0,
        totalWhiteCells: countWhiteCells(puzzle),
      };
    }

    case "RESET":
      // The setting outlives the puzzle; the grid does not.
      return { ...initialState, autocheck: state.autocheck };

    case "SET_AUTOCHECK":
      return state.autocheck === action.autocheck ? state : { ...state, autocheck: action.autocheck };

    case "SELECT_CELL": {
      if (!state.puzzle || isBlack(state.puzzle, action.row, action.col)) {
        return state;
      }
      // If clicking the already-selected cell, toggle direction (unless the
      // other direction is a single cell — then there is nothing to toggle to)
      if (
        state.selectedCell?.row === action.row &&
        state.selectedCell?.col === action.col
      ) {
        const flipped: Direction = state.direction === "across" ? "down" : "across";
        return {
          ...state,
          direction: settleDirection(state.puzzle, action.row, action.col, flipped),
        };
      }
      return {
        ...state,
        selectedCell: { row: action.row, col: action.col },
        direction: settleDirection(state.puzzle, action.row, action.col, state.direction),
      };
    }

    case "TOGGLE_DIRECTION": {
      const flipped: Direction = state.direction === "across" ? "down" : "across";
      if (!state.puzzle || !state.selectedCell) return { ...state, direction: flipped };
      return {
        ...state,
        direction: settleDirection(
          state.puzzle,
          state.selectedCell.row,
          state.selectedCell.col,
          flipped,
        ),
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
      const existing = state.playerCells[key];

      // A settled square — correct under autocheck, or revealed — only moves
      // the cursor on. Without autocheck a correct letter is overwritable like
      // any other: refusing to change it would give its correctness away.
      if (existing?.correct && (state.autocheck || existing.revealed)) {
        const next = advanceCursor(state.puzzle, state.playerCells, row, col, state.direction, state.autocheck);
        return next
          ? { ...state, selectedCell: next.coord, direction: next.direction }
          : state;
      }

      const correct = letter === cell.solution;
      if (!correct && state.autocheck) {
        // Incorrect letter — silently reject (don't place it)
        return state;
      }

      // Place the letter and advance. `at` records when, for the spoiler-free
      // share block's pace colours (callers may pass a clock). A fresh
      // CellState drops any `checked` mark the square carried.
      const newCells = {
        ...state.playerCells,
        [key]: { letter, correct, playerId: action.playerId, at: action.at ?? Date.now() },
      };
      const newScore = state.score - (existing?.correct ? 1 : 0) + (correct ? 1 : 0);
      const next = advanceCursor(state.puzzle, newCells, row, col, state.direction, state.autocheck);
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
      const current = state.playerCells[key];

      // If current cell has a letter, delete it (a revealed square is locked:
      // treat it as empty and step back). Only a correct letter was counted.
      if (current && !current.revealed) {
        const newCells = { ...state.playerCells };
        delete newCells[key];
        return {
          ...state,
          playerCells: newCells,
          score: state.score - (current.correct ? 1 : 0),
        };
      }

      // Otherwise, move back and delete that cell
      const prev = getPrevCell(state.puzzle, row, col, state.direction);
      if (prev) {
        const prevKey = `${prev.row},${prev.col}`;
        const prevState = state.playerCells[prevKey];
        if (prevState && !prevState.revealed) {
          const newCells = { ...state.playerCells };
          delete newCells[prevKey];
          return {
            ...state,
            playerCells: newCells,
            score: state.score - (prevState.correct ? 1 : 0),
            selectedCell: prev,
          };
        }
        return { ...state, selectedCell: prev };
      }
      return state;
    }

    case "MOVE_SELECTION": {
      if (!state.puzzle || !state.selectedCell) return state;
      if (action.dr === 0 && action.dc === 0) return state;
      const { puzzle } = state;
      // Walk in the arrow's direction, skipping over black squares, until a
      // white cell; the grid edge is a stop (no wrap).
      let nr = state.selectedCell.row + action.dr;
      let nc = state.selectedCell.col + action.dc;
      while (nr >= 0 && nr < puzzle.height && nc >= 0 && nc < puzzle.width) {
        if (!isBlack(puzzle, nr, nc)) break;
        nr += action.dr;
        nc += action.dc;
      }
      if (nr < 0 || nr >= puzzle.height || nc < 0 || nc >= puzzle.width) {
        return state;
      }

      // Direction follows the arrow, unless that word is a single cell
      const wanted: Direction = action.dr !== 0 ? "down" : "across";

      return {
        ...state,
        selectedCell: { row: nr, col: nc },
        direction: settleDirection(puzzle, nr, nc, wanted),
      };
    }

    case "NEXT_WORD": {
      if (!state.puzzle || !state.selectedCell) return state;
      const completed = (state.autocheck ? getCompletedClues : getFilledClues)(state.puzzle, state.playerCells);
      const { coord, direction } = getNextWordStart(
        state.puzzle,
        state.selectedCell.row,
        state.selectedCell.col,
        state.direction,
        completed,
      );
      return { ...state, selectedCell: coord, direction };
    }

    case "PREV_WORD": {
      if (!state.puzzle || !state.selectedCell) return state;
      const completed = (state.autocheck ? getCompletedClues : getFilledClues)(state.puzzle, state.playerCells);
      const { coord, direction } = getPrevWordStart(
        state.puzzle,
        state.selectedCell.row,
        state.selectedCell.col,
        state.direction,
        completed,
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
        [key]: { letter: action.letter, correct: true, playerId: action.playerId, at: action.at ?? Date.now() },
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

    case "CHECK_CELLS": {
      if (!state.puzzle) return state;
      let newCells: Record<string, CellState> | null = null;
      let firstWrong: CellCoord | null = null;
      for (const { row, col } of action.cells) {
        const key = `${row},${col}`;
        const c = state.playerCells[key];
        if (!c?.letter || c.correct || c.checked === "wrong") continue;
        newCells ??= { ...state.playerCells };
        newCells[key] = { ...c, checked: "wrong" };
        firstWrong ??= { row, col };
      }
      if (!newCells) return state;
      // The cursor lands on the first square just marked, unless it is already
      // on one, so the solver can retype at once (and the keyboard stays put).
      const sel = state.selectedCell;
      const onWrong = sel && newCells[`${sel.row},${sel.col}`]?.checked === "wrong";
      return onWrong || !firstWrong
        ? { ...state, playerCells: newCells }
        : {
            ...state,
            playerCells: newCells,
            selectedCell: firstWrong,
            direction: settleDirection(state.puzzle, firstWrong.row, firstWrong.col, state.direction),
          };
    }

    case "REVEAL_CELL": {
      if (!state.puzzle) return state;
      const cell = state.puzzle.cells[action.row]?.[action.col];
      if (!cell || cell.solution === null) return state;
      const key = `${action.row},${action.col}`;
      const existing = state.playerCells[key];
      if (existing?.revealed) return state;
      const newCells = {
        ...state.playerCells,
        [key]: { letter: cell.solution, correct: true, revealed: true, playerId: existing?.playerId, at: action.at ?? Date.now() },
      };
      return {
        ...state,
        playerCells: newCells,
        score: state.score + (existing?.correct ? 0 : 1),
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
  const setAutocheck = useCallback(
    (autocheck: boolean) => dispatch({ type: "SET_AUTOCHECK", autocheck }),
    [],
  );
  const checkCells = useCallback(
    (cells: CellCoord[]) => dispatch({ type: "CHECK_CELLS", cells }),
    [],
  );
  const revealCell = useCallback(
    (row: number, col: number) => dispatch({ type: "REVEAL_CELL", row, col }),
    [],
  );

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
    setAutocheck,
    checkCells,
    revealCell,
  };
}
