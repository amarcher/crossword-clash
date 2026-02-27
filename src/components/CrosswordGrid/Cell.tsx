import { memo } from "react";
import type { PuzzleCell, CellState } from "../../types/puzzle";

/** Blend a hex color at given alpha against white, returning an opaque rgb() string. */
export function blendOnWhite(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * alpha + 255 * (1 - alpha))},${Math.round(g * alpha + 255 * (1 - alpha))},${Math.round(b * alpha + 255 * (1 - alpha))})`;
}

/** Convert hex to rgba() string. */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface CellProps {
  cell: PuzzleCell;
  cellState?: CellState;
  isSelected: boolean;
  isHighlighted: boolean;
  isRejected?: boolean;
  onClick?: (row: number, col: number) => void;
  playerColorMap?: Record<string, string>;
  /** Triggers a scale-pop entrance animation when the cell is first filled */
  animateFill?: boolean;
  /** Triggers a word-completion sweep animation; value is the player's hex color */
  wordCompleteColor?: string;
  /** Stagger delay (ms) for the word-completion sweep */
  wordCompleteDelay?: number;
}

export const Cell = memo(function Cell({
  cell,
  cellState,
  isSelected,
  isHighlighted,
  isRejected,
  onClick,
  playerColorMap,
  animateFill,
  wordCompleteColor,
  wordCompleteDelay,
}: CellProps) {
  if (cell.solution === null) {
    return <div className="bg-black min-h-0 min-w-0 overflow-hidden" />;
  }

  // Pre-blend player color against white so it doesn't composite against the
  // grid's black background. 18% tint gives a visible pastel with high text contrast.
  const playerBg =
    cellState?.playerId && playerColorMap?.[cellState.playerId]
      ? blendOnWhite(playerColorMap[cellState.playerId], 0.18)
      : undefined;

  // Background: player color is always visible (only overridden by selected yellow)
  let bg = "bg-white";
  if (isSelected) bg = "bg-yellow-200";
  else if (playerBg) bg = "";
  else if (isHighlighted) bg = "bg-amber-50";

  const bgStyle = !isSelected && playerBg
    ? { backgroundColor: playerBg }
    : undefined;

  // Outline for active word / selected cell (never obscures player color)
  let outlineStyle: React.CSSProperties | undefined;
  if (isSelected) {
    outlineStyle = { outline: "3px solid #b45309", outlineOffset: "-3px" };
  } else if (isHighlighted) {
    outlineStyle = { outline: "2px solid rgba(180,83,9,0.75)", outlineOffset: "-2px" };
  }

  // Build animation class + inline style for word-complete sweep
  let animClass = "";
  let animStyle: React.CSSProperties | undefined;
  if (wordCompleteColor) {
    animClass = " cell-word-complete";
    animStyle = {
      "--sweep-color": hexToRgba(wordCompleteColor, 0.35),
      animationDelay: `${wordCompleteDelay ?? 0}ms`,
    } as React.CSSProperties;
  } else if (animateFill) {
    animClass = " cell-fill";
  }

  return (
    <div
      className={`${bg} relative ${onClick ? "cursor-pointer" : ""} select-none min-h-0 min-w-0 overflow-hidden${isRejected ? " cell-reject" : ""}${animClass}`}
      style={{ containerType: "inline-size", ...bgStyle, ...outlineStyle, ...animStyle }}
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
