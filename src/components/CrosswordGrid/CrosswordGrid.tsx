import { useRef, useCallback, useEffect } from "react";
import type { Puzzle, CellState } from "../../types/puzzle";
import { Cell } from "./Cell";

export interface NavigationActions {
  inputLetter: (letter: string) => void;
  deleteLetter: () => void;
  moveSelection: (dr: number, dc: number) => void;
  nextWord: () => void;
  prevWord: () => void;
  toggleDirection: () => void;
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
}: CrosswordGridProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on desktop so keystrokes are captured immediately.
  // Skip on touch devices — iOS ignores non-gesture focus anyway, and
  // focusing can cause unwanted scroll/viewport side effects.
  useEffect(() => {
    if (interactive && navigationActions && selectedCell && inputRef.current) {
      const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      if (!isTouch) {
        inputRef.current.focus();
      }
    }
  }, [interactive, navigationActions, selectedCell !== null]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Fill available viewport: subtract header (~4.5rem) + top/bottom padding (2rem)
  // The main's p-4 provides matching whitespace on all sides
  const gridSize = `min(calc(100dvh - var(--grid-h-offset, 6.5rem)), calc(100vw - 2rem))`;
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
          return (
            <Cell
              key={key}
              cell={cell}
              cellState={playerCells[key]}
              isSelected={
                interactive && selectedCell?.row === cell.row && selectedCell?.col === cell.col
              }
              isHighlighted={interactive && highlightedCells.has(key)}
              onClick={interactive ? handleCellClick : undefined}
              playerColorMap={playerColorMap}
            />
          );
        })}
      </div>
    </div>
  );
}
