import { memo } from "react";
import type { PuzzleCell, CellState } from "../../types/puzzle";

interface CellProps {
  cell: PuzzleCell;
  cellState?: CellState;
  isSelected: boolean;
  isHighlighted: boolean;
  onClick: (row: number, col: number) => void;
}

export const Cell = memo(function Cell({
  cell,
  cellState,
  isSelected,
  isHighlighted,
  onClick,
}: CellProps) {
  if (cell.solution === null) {
    return <div className="bg-neutral-900" />;
  }

  let bg = "bg-white";
  if (isSelected) bg = "bg-yellow-300";
  else if (isHighlighted) bg = "bg-blue-100";

  return (
    <div
      className={`${bg} relative border border-neutral-400 cursor-pointer select-none flex items-center justify-center`}
      onClick={() => onClick(cell.row, cell.col)}
    >
      {cell.number != null && (
        <span className="absolute top-px left-0.5 text-[10px] leading-none font-medium text-neutral-700">
          {cell.number}
        </span>
      )}
      {cellState?.letter && (
        <span className="text-lg font-bold leading-none text-neutral-900">
          {cellState.letter}
        </span>
      )}
    </div>
  );
});
