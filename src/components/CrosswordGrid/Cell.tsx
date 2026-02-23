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
    return <div className="bg-black min-h-0 min-w-0 overflow-hidden" />;
  }

  let bg = "bg-white";
  if (isSelected) bg = "bg-yellow-300";
  else if (isHighlighted) bg = "bg-blue-100";

  return (
    <div
      className={`${bg} relative cursor-pointer select-none min-h-0 min-w-0 overflow-hidden`}
      onClick={() => onClick(cell.row, cell.col)}
    >
      {cell.number != null && (
        <span className="absolute top-px left-0.5 text-[10px] leading-none font-medium text-neutral-700">
          {cell.number}
        </span>
      )}
      {cellState?.letter && (
        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-none text-neutral-900">
          {cellState.letter}
        </span>
      )}
    </div>
  );
});
