import type { Puzzle } from "../../types/puzzle";

/**
 * The four corner squares follow the frame's rounding (6px outer radius less
 * the 1px frame), so no square corner pokes past it.
 */
function cornerClass(row: number, col: number, width: number, height: number): string {
  const top = row === 0;
  const bottom = row === height - 1;
  const left = col === 0;
  const right = col === width - 1;
  return [
    top && left && "rounded-tl-[5px]",
    top && right && "rounded-tr-[5px]",
    bottom && left && "rounded-bl-[5px]",
    bottom && right && "rounded-br-[5px]",
  ]
    .filter(Boolean)
    .join(" ");
}

interface MiniGridThumbProps {
  puzzle: Puzzle;
  className?: string;
  style?: React.CSSProperties;
  /**
   * The viewer has solved this puzzle: the white squares take a filled tone
   * (no letters, so nothing is given away to someone looking over a shoulder)
   * and a check sits over the grid. An empty thumbnail on a solved daily read
   * as "still to do" (Andrew, 2026-11-10).
   */
  solved?: boolean;
}

/** A small, non-interactive rendering of a puzzle's grid shape (blocks + numbers). */
export function MiniGridThumb({ puzzle, className = "", style, solved = false }: MiniGridThumbProps) {
  return (
    <div
      aria-hidden="true"
      data-solved={solved || undefined}
      className={`relative grid gap-px rounded-md bg-ink p-px ${className}`}
      style={{ ...style, gridTemplateColumns: `repeat(${puzzle.width}, minmax(0, 1fr))`, aspectRatio: `${puzzle.width} / ${puzzle.height}` }}
    >
      {puzzle.cells.flat().map((cell) => (
        <div
          key={`${cell.row}-${cell.col}`}
          className={`relative ${cell.solution === null ? "bg-ink" : solved ? "bg-brand-200" : "bg-surface"} ${cornerClass(cell.row, cell.col, puzzle.width, puzzle.height)}`}
        >
          {cell.number !== undefined && puzzle.width <= 7 && !solved && (
            <span className="absolute left-[3px] top-px text-[8px] font-semibold leading-none text-ink-soft">{cell.number}</span>
          )}
        </div>
      ))}
      {solved && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid size-[38%] place-items-center rounded-full bg-brand-600 text-white shadow-raised ring-2 ring-white">
            <svg viewBox="0 0 24 24" fill="none" className="size-[58%]">
              <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </span>
      )}
    </div>
  );
}
