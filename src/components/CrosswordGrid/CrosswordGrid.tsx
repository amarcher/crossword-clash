import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import type { Puzzle, CellState, PuzzleClue } from "../../types/puzzle";
import { getWordCells, getCompletedClues } from "../../lib/gridUtils";
import { Cell } from "./Cell";

export interface NavigationActions {
  inputLetter: (letter: string) => void;
  deleteLetter: () => void;
  moveSelection: (dr: number, dc: number) => void;
  nextWord: () => void;
  prevWord: () => void;
  toggleDirection: () => void;
}

/** Info about a word that just completed — used for cascade animation */
interface WordCompletion {
  /** Cell keys in order (left→right or top→bottom) */
  cellKeys: string[];
  /** Player hex color for the sweep */
  color: string;
  /** Timestamp for cleanup */
  expiresAt: number;
}

interface CrosswordGridProps {
  puzzle: Puzzle;
  playerCells: Record<string, CellState>;
  selectedCell: { row: number; col: number } | null;
  highlightedCells: Set<string>;
  onCellClick: (row: number, col: number) => void;
  playerColorMap?: Record<string, string>;
  interactive?: boolean;
  navigationActions?: NavigationActions;
  rejectedCell?: string | null;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function CrosswordGrid({
  puzzle,
  playerCells,
  selectedCell,
  highlightedCells,
  onCellClick,
  playerColorMap,
  interactive = true,
  navigationActions,
  rejectedCell,
  inputRef: externalInputRef,
}: CrosswordGridProps) {
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;

  const isTouchDevice = useMemo(
    () => "ontouchstart" in window || navigator.maxTouchPoints > 0,
    [],
  );

  const [inputFocused, setInputFocused] = useState(false);

  // On mobile, only show selection highlights when the hidden input is focused
  // (i.e., the virtual keyboard is available). Desktop always shows selection.
  const showSelection = !isTouchDevice || inputFocused;

  // --- Cell fill animation tracking ---
  // Track which cell keys have been seen with a letter so we only animate new fills.
  const seenCellsRef = useRef<Set<string>>(new Set());
  const [animatingFills, setAnimatingFills] = useState<Set<string>>(new Set());

  useEffect(() => {
    const newFills: string[] = [];
    for (const [key, state] of Object.entries(playerCells)) {
      if (state.letter && !seenCellsRef.current.has(key)) {
        seenCellsRef.current.add(key);
        newFills.push(key);
      }
    }
    if (newFills.length === 0) return;

    setAnimatingFills((prev) => {
      const next = new Set(prev);
      for (const k of newFills) next.add(k);
      return next;
    });

    const timer = setTimeout(() => {
      setAnimatingFills((prev) => {
        const next = new Set(prev);
        for (const k of newFills) next.delete(k);
        return next;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [playerCells]);

  // --- Word completion cascade tracking ---
  const prevCompletedRef = useRef<Set<string>>(new Set());
  const [wordCompletions, setWordCompletions] = useState<WordCompletion[]>([]);

  useEffect(() => {
    const current = getCompletedClues(puzzle, playerCells);
    const previous = prevCompletedRef.current;

    const newCompletions: WordCompletion[] = [];
    for (const clueKey of current) {
      if (previous.has(clueKey)) continue;

      // Parse "across-5" → find the clue
      const dashIdx = clueKey.lastIndexOf("-");
      const dir = clueKey.slice(0, dashIdx) as "across" | "down";
      const num = parseInt(clueKey.slice(dashIdx + 1));
      const clue: PuzzleClue | undefined = puzzle.clues.find(
        (c) => c.direction === dir && c.number === num,
      );
      if (!clue) continue;

      const cells = getWordCells(puzzle, clue.row, clue.col, clue.direction);
      if (cells.length === 0) continue;

      // Determine the completing player (last cell's playerId)
      const lastCell = cells[cells.length - 1];
      const lastState = playerCells[`${lastCell.row},${lastCell.col}`];
      const playerId = lastState?.playerId;
      const color =
        playerId && playerColorMap?.[playerId]
          ? playerColorMap[playerId]
          : "#3b82f6"; // fallback blue

      newCompletions.push({
        cellKeys: cells.map((c) => `${c.row},${c.col}`),
        color,
        expiresAt: Date.now() + 600 + cells.length * 60,
      });
    }

    prevCompletedRef.current = current;

    if (newCompletions.length === 0) return;

    setWordCompletions((prev) => [...prev, ...newCompletions]);

    // Cleanup after the longest animation
    const maxDuration = Math.max(
      ...newCompletions.map((wc) => wc.expiresAt - Date.now()),
    );
    const timer = setTimeout(() => {
      const now = Date.now();
      setWordCompletions((prev) => prev.filter((wc) => wc.expiresAt > now));
    }, maxDuration + 50);

    return () => clearTimeout(timer);
  }, [puzzle, playerCells, playerColorMap]);

  // Build a lookup: cellKey → { color, delay } for word completion animations
  const wordCompleteMap = new Map<string, { color: string; delay: number }>();
  for (const wc of wordCompletions) {
    for (let i = 0; i < wc.cellKeys.length; i++) {
      wordCompleteMap.set(wc.cellKeys[i], { color: wc.color, delay: i * 60 });
    }
  }

  // Auto-focus on desktop so keystrokes are captured immediately.
  // Skip on touch devices — iOS ignores non-gesture focus anyway, and
  // focusing can cause unwanted scroll/viewport side effects.
  useEffect(() => {
    if (interactive && navigationActions && selectedCell && inputRef.current) {
      if (!isTouchDevice) {
        inputRef.current.focus();
      }
    }
  }, [interactive, navigationActions, selectedCell !== null, isTouchDevice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the hidden input when a cell is clicked (triggers mobile keyboard).
  // iOS requires .focus() synchronously within the user gesture — no rAF or setTimeout.
  const handleCellClick = useCallback(
    (row: number, col: number) => {
      onCellClick(row, col);
      inputRef.current?.focus();
    },
    [onCellClick],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!navigationActions) return;
      const key = e.key;

      if (/^[a-zA-Z]$/.test(key)) {
        e.preventDefault();
        navigationActions.inputLetter(key);
        return;
      }

      switch (key) {
        case "Backspace":
          e.preventDefault();
          navigationActions.deleteLetter();
          break;
        case "ArrowUp":
          e.preventDefault();
          navigationActions.moveSelection(-1, 0);
          break;
        case "ArrowDown":
          e.preventDefault();
          navigationActions.moveSelection(1, 0);
          break;
        case "ArrowLeft":
          e.preventDefault();
          navigationActions.moveSelection(0, -1);
          break;
        case "ArrowRight":
          e.preventDefault();
          navigationActions.moveSelection(0, 1);
          break;
        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            navigationActions.prevWord();
          } else {
            navigationActions.nextWord();
          }
          break;
        case " ":
          e.preventDefault();
          navigationActions.toggleDirection();
          break;
      }
    },
    [navigationActions],
  );

  // Fallback for mobile keyboards that don't fire reliable keydown for letters
  const handleBeforeInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      if (!navigationActions) return;
      const nativeEvent = e.nativeEvent as InputEvent;
      const data = nativeEvent.data;
      if (data && /^[a-zA-Z]$/.test(data)) {
        e.preventDefault();
        navigationActions.inputLetter(data);
      }
    },
    [navigationActions],
  );

  // Fill available viewport: subtract header + padding vertically, and sidebar + padding horizontally.
  // --grid-h-offset: vertical space reserved for header + padding (default 6.5rem)
  // --grid-w-offset: horizontal space reserved for sidebar + padding + gap (default 1rem)
  // --grid-h-max: optional hard cap on grid height (default: none / 100dvh)
  //   Used on non-touch narrow viewports so clues below the grid remain visible.
  const hMax = `var(--grid-h-max, 100dvh)`;
  const gridSize = `min(calc(100dvh - var(--grid-h-offset, 6.5rem)), calc(100vw - var(--grid-w-offset, 1rem)), ${hMax})`;
  const gridWidth =
    puzzle.width >= puzzle.height
      ? gridSize
      : `calc(${gridSize} * ${puzzle.width} / ${puzzle.height})`;
  const gridHeight =
    puzzle.height >= puzzle.width
      ? gridSize
      : `calc(${gridSize} * ${puzzle.height} / ${puzzle.width})`;

  return (
    <div className="relative shrink-0">
      {interactive && navigationActions && (
        <input
          ref={inputRef}
          className="absolute opacity-0"
          style={{
            top: "50%",
            left: "50%",
            width: "1px",
            height: "1px",
            fontSize: "16px",       // prevents iOS auto-zoom on focus
            caretColor: "transparent",
            border: "none",
            padding: 0,
            margin: 0,
          }}
          name="crossword-cell"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="nofill"
          spellCheck={false}
          enterKeyHint="next"
          inputMode="text"
          aria-label="Crossword input"
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onKeyDown={handleKeyDown}
          onBeforeInput={handleBeforeInput}
          onChange={() => {
            // Clear after any input so backspace always has something to delete
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      )}
      <div
        className="grid border-2 border-black bg-black"
        style={{
          width: gridWidth,
          height: gridHeight,
          gridTemplateColumns: `repeat(${puzzle.width}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${puzzle.height}, minmax(0, 1fr))`,
          gap: "1px",
        }}
      >
        {puzzle.cells.flat().map((cell) => {
          const key = `${cell.row},${cell.col}`;
          const wcInfo = wordCompleteMap.get(key);
          return (
            <Cell
              key={key}
              cell={cell}
              cellState={playerCells[key]}
              isSelected={
                interactive && showSelection && selectedCell?.row === cell.row && selectedCell?.col === cell.col
              }
              isHighlighted={interactive && showSelection && highlightedCells.has(key)}
              isRejected={key === rejectedCell}
              onClick={interactive ? handleCellClick : undefined}
              playerColorMap={playerColorMap}
              animateFill={animatingFills.has(key)}
              wordCompleteColor={wcInfo?.color}
              wordCompleteDelay={wcInfo?.delay}
            />
          );
        })}
      </div>
    </div>
  );
}
