import { memo } from "react";
import type { PuzzleCell, CellState } from "../../types/puzzle";

interface CellProps {
  cell: PuzzleCell;
  cellState?: CellState;
  isSelected: boolean;
  isHighlighted: boolean;
  onClick: (row: number, col: number) => void;
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

  // Player color background (hex + "22" for ~13% opacity)
  const playerColor =
    cellState?.playerId && playerColorMap?.[cellState.playerId]
      ? `${playerColorMap[cellState.playerId]}22`
      : undefined;

  let bg = "bg-white";
  if (isSelected) bg = "bg-yellow-300";
  else if (isHighlighted) bg = "bg-blue-100";
  else if (playerColor) bg = "";

  const style = !isSelected && !isHighlighted && playerColor
    ? { backgroundColor: playerColor }
    : undefined;

  return (
    <div
      className={`${bg} relative cursor-pointer select-none min-h-0 min-w-0 overflow-hidden`}
      style={{ containerType: "inline-size", ...style }}
      onClick={() => onClick(cell.row, cell.col)}
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
