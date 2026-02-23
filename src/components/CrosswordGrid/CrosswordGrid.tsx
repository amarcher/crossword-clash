import type { Puzzle, CellState } from "../../types/puzzle";
import { Cell } from "./Cell";

interface CrosswordGridProps {
  puzzle: Puzzle;
  playerCells: Record<string, CellState>;
  selectedCell: { row: number; col: number } | null;
  highlightedCells: Set<string>;
  onCellClick: (row: number, col: number) => void;
  playerColorMap?: Record<string, string>;
}

export function CrosswordGrid({
  puzzle,
  playerCells,
  selectedCell,
  highlightedCells,
  onCellClick,
  playerColorMap,
}: CrosswordGridProps) {
  // Fill available viewport: subtract header (~4.5rem) + top/bottom padding (2rem)
  // The main's p-4 provides matching whitespace on all sides
  const gridSize = `min(calc(100dvh - 6.5rem), calc(100vw - 2rem))`;
  const gridWidth =
    puzzle.width >= puzzle.height
      ? gridSize
      : `calc(${gridSize} * ${puzzle.width} / ${puzzle.height})`;
  const gridHeight =
    puzzle.height >= puzzle.width
      ? gridSize
      : `calc(${gridSize} * ${puzzle.height} / ${puzzle.width})`;

  return (
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
              selectedCell?.row === cell.row && selectedCell?.col === cell.col
            }
            isHighlighted={highlightedCells.has(key)}
            onClick={onCellClick}
            playerColorMap={playerColorMap}
          />
        );
      })}
    </div>
  );
}
