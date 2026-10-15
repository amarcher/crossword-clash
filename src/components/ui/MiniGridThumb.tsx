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

/** A small, non-interactive rendering of a puzzle's grid shape (blocks + numbers). */
export function MiniGridThumb({ puzzle, className = "" }: { puzzle: Puzzle; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`grid gap-px rounded-md bg-ink p-px ${className}`}
      style={{ gridTemplateColumns: `repeat(${puzzle.width}, minmax(0, 1fr))`, aspectRatio: `${puzzle.width} / ${puzzle.height}` }}
    >
      {puzzle.cells.flat().map((cell) => (
        <div
          key={`${cell.row}-${cell.col}`}
          className={`relative ${cell.solution === null ? "bg-ink" : "bg-surface"} ${cornerClass(cell.row, cell.col, puzzle.width, puzzle.height)}`}
        >
          {cell.number !== undefined && puzzle.width <= 7 && (
            <span className="absolute left-[3px] top-px text-[8px] font-semibold leading-none text-ink-soft">{cell.number}</span>
          )}
        </div>
      ))}
    </div>
  );
}
