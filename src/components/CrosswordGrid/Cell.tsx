import { memo } from "react";
import type { PuzzleCell, CellState } from "../../types/puzzle";

interface CellProps {
  cell: PuzzleCell;
  cellState?: CellState;
  isSelected: boolean;
  isHighlighted: boolean;
  onClick?: (row: number, col: number) => void;
  playerColorMap?: Record<string, string>;
}

export const Cell = memo(function Cell({
  cell,
  cellState,
  isSelected,
  isHighlighted,
  onClick,
  playerColorMap,
}: CellProps) {
  if (cell.solution === null) {
    return <div className="bg-black min-h-0 min-w-0 overflow-hidden" />;
  }

  // Player color background (hex + "1a" for ~10% opacity — light tint, high text contrast)
  const playerColor =
    cellState?.playerId && playerColorMap?.[cellState.playerId]
      ? `${playerColorMap[cellState.playerId]}1a`
      : undefined;

  let bg = "bg-white";
  if (isSelected) bg = "bg-yellow-200";
  else if (isHighlighted) bg = "bg-blue-50";
  else if (playerColor) bg = "";

  const style = !isSelected && !isHighlighted && playerColor
    ? { backgroundColor: playerColor }
    : undefined;

  return (
    <div
      className={`${bg} relative ${onClick ? "cursor-pointer" : ""} select-none min-h-0 min-w-0 overflow-hidden`}
      style={{ containerType: "inline-size", ...style }}
      onClick={onClick ? () => onClick(cell.row, cell.col) : undefined}
    >
      {cell.number != null && (
        <span
          className="absolute top-[2cqi] left-[4cqi] leading-none font-medium text-neutral-700"
          style={{ fontSize: "25cqi" }}
        >
          {cell.number}
        </span>
      )}
      {cellState?.letter && (
        <span
          className="absolute inset-0 flex items-center justify-center font-bold leading-none text-neutral-900"
          style={{ fontSize: "55cqi" }}
        >
          {cellState.letter}
        </span>
      )}
    </div>
  );
});
