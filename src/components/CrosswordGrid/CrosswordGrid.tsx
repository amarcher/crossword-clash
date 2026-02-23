import type { Puzzle, CellState } from "../../types/puzzle";
import { Cell } from "./Cell";

interface CrosswordGridProps {
  puzzle: Puzzle;
  playerCells: Record<string, CellState>;
  selectedCell: { row: number; col: number } | null;
  highlightedCells: Set<string>;
  onCellClick: (row: number, col: number) => void;
}

export function CrosswordGrid({
  puzzle,
  playerCells,
  selectedCell,
  highlightedCells,
  onCellClick,
}: CrosswordGridProps) {
  return (
    <div
      className="grid border border-neutral-700 aspect-square w-full max-w-[500px]"
      style={{
        gridTemplateColumns: `repeat(${puzzle.width}, 1fr)`,
        gridTemplateRows: `repeat(${puzzle.height}, 1fr)`,
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
          />
        );
      })}
    </div>
  );
}
