import { memo } from "react";
import type { PuzzleCell, CellState } from "../../types/puzzle";

/** `--color-gold-400` from src/index.css: the cursor fill, and the tint laid over player colours. */
const GOLD_400 = "#f5bd2c";
/** How strong the active-word tint is when laid over a player's colour (≈ gold-100 over white). */
const WORD_TINT_ALPHA = 0.35;

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

type Rgb = [number, number, number];
const WHITE: Rgb = [255, 255, 255];

/** Composite a hex colour at `alpha` over an opaque rgb base. */
function blendOver(hex: string, alpha: number, base: Rgb): Rgb {
  const top = hexToRgb(hex);
  return top.map((v, i) => Math.round(v * alpha + base[i] * (1 - alpha))) as Rgb;
}

function rgbString([r, g, b]: Rgb): string {
  return `rgb(${r},${g},${b})`;
}

/** Blend a hex color at given alpha against white, returning an opaque rgb() string. */
export function blendOnWhite(hex: string, alpha: number): string {
  return rgbString(blendOver(hex, alpha, WHITE));
}

/** Convert hex to rgba() string. */
export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
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

/**
 * One square of the solver grid. Selection is fills only, as in the studio
 * grid: gold-400 under the cursor, gold-100 along the active word, and no
 * outlines (a per-cell outline turned the word into a ladder of boxes). In
 * multiplayer a player's tint stays visible under the word highlight — gold is
 * composited over it — so the band reads as one continuous stroke across
 * owned and unowned cells.
 */
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
    return <div className="bg-ink min-h-0 min-w-0 overflow-hidden" role="gridcell" aria-hidden="true" />;
  }

  // Build accessible label: "Row 1, Column 3, 5 across, letter A"
  const parts: string[] = [];
  if (cell.number != null) parts.push(`${cell.number}`);
  if (cellState?.letter) parts.push(cellState.letter);
  const ariaLabel = `Row ${cell.row + 1}, Column ${cell.col + 1}${parts.length ? `, ${parts.join(", ")}` : ""}`;

  // A player's colour is pre-blended against white (18% reads as a pastel with
  // high text contrast) so it never composites against the ink grid behind.
  const playerHex = cellState?.playerId ? playerColorMap?.[cellState.playerId] : undefined;
  const playerTint = playerHex ? blendOver(playerHex, 0.18, WHITE) : undefined;

  // Background priority: cursor > active word (over any player tint) > player tint > white.
  let bg = "bg-surface";
  let bgStyle: React.CSSProperties | undefined;
  if (isSelected) {
    bg = "bg-gold-400";
  } else if (isHighlighted && playerTint) {
    bg = "";
    bgStyle = { backgroundColor: rgbString(blendOver(GOLD_400, WORD_TINT_ALPHA, playerTint)) };
  } else if (isHighlighted) {
    bg = "bg-gold-100";
  } else if (playerTint) {
    bg = "";
    bgStyle = { backgroundColor: rgbString(playerTint) };
  }

  // Word-complete sweep runs on the cell; the fill pop runs on the letter span
  // only, so the cell's own background never fades out and shows the ink grid.
  let animClass = "";
  let animStyle: React.CSSProperties | undefined;
  if (wordCompleteColor) {
    animClass = " cell-word-complete";
    animStyle = {
      "--sweep-color": hexToRgba(wordCompleteColor, 0.35),
      animationDelay: `${wordCompleteDelay ?? 0}ms`,
    } as React.CSSProperties;
  }
  const letterAnimClass = animateFill && !wordCompleteColor ? " cell-fill" : "";

  return (
    <div
      role="gridcell"
      aria-label={ariaLabel}
      aria-selected={isSelected || undefined}
      className={`${bg} relative ${onClick ? "cursor-pointer" : ""} select-none min-h-0 min-w-0 overflow-hidden${isRejected ? " cell-reject" : ""}${animClass}`}
      style={{ containerType: "inline-size", ...bgStyle, ...animStyle }}
      onClick={onClick ? () => onClick(cell.row, cell.col) : undefined}
    >
      {cell.number != null && (
        <span
          aria-hidden="true"
          className="absolute top-[2cqi] left-[4cqi] leading-none font-semibold text-ink-soft"
          style={{ fontSize: "min(25cqi, 17px)" }}
        >
          {cell.number}
        </span>
      )}
      {cellState?.letter && (
        <span
          aria-hidden="true"
          className={`absolute inset-0 flex items-center justify-center font-bold leading-none text-ink${letterAnimClass}`}
          style={{ fontSize: "55cqi" }}
        >
          {cellState.letter}
        </span>
      )}
    </div>
  );
});
