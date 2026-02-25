import { memo } from "react";
import type { PuzzleCell, CellState } from "../../types/puzzle";

/** Blend a hex color at given alpha against white, returning an opaque rgb() string. */
export function blendOnWhite(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * alpha + 255 * (1 - alpha))},${Math.round(g * alpha + 255 * (1 - alpha))},${Math.round(b * alpha + 255 * (1 - alpha))})`;
}

interface CellProps {
  cell: PuzzleCell;
  cellState?: CellState;
  isSelected: boolean;
  isHighlighted: boolean;
  isRejected?: boolean;
  onClick?: (row: number, col: number) => void;
  playerColorMap?: Record<string, string>;
}

export const Cell = memo(function Cell({
  cell,
  cellState,
  isSelected,
  isHighlighted,
  isRejected,
  onClick,
  playerColorMap,
}: CellProps) {
  if (cell.solution === null) {
    return <div className="bg-black min-h-0 min-w-0 overflow-hidden" />;
  }

  // Pre-blend player color against white so it doesn't composite against the
  // grid's black background. 12% tint gives a soft pastel with high text contrast.
  const playerBg =
    cellState?.playerId && playerColorMap?.[cellState.playerId]
      ? blendOnWhite(playerColorMap[cellState.playerId], 0.12)
      : undefined;

  let bg = "bg-white";
  if (isSelected) bg = "bg-yellow-200";
  else if (isHighlighted) bg = "bg-blue-50";
  else if (playerBg) bg = "";

  const style = !isSelected && !isHighlighted && playerBg
    ? { backgroundColor: playerBg }
    : undefined;

  return (
    <div
      className={`${bg} relative ${onClick ? "cursor-pointer" : ""} select-none min-h-0 min-w-0 overflow-hidden${isRejected ? " cell-reject" : ""}`}
      style={{ containerType: "inline-size", ...style }}
      onClick={onClick ? () => onClick(cell.row, cell.col) : undefined}
    >
      {cell.number != null && (
        <span
          className="absolute top-[2cqi] left-[4cqi] leading-none font-medium text-neutral-800"
          style={{ fontSize: "25cqi" }}
        >
          {cell.number}
        </span>
      )}
      {cellState?.letter && (
        <span
          className="absolute inset-0 flex items-center justify-center font-bold leading-none text-black"
          style={{ fontSize: "55cqi" }}
        >
          {cellState.letter}
        </span>
      )}
    </div>
  );
});
