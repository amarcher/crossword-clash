import type { Puzzle } from "../../types/puzzle";

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
          className={`relative ${cell.solution === null ? "bg-ink" : "bg-surface"} first:rounded-tl-[5px]`}
        >
          {cell.number !== undefined && puzzle.width <= 7 && (
            <span className="absolute left-[3px] top-px text-[8px] font-semibold leading-none text-ink-soft">{cell.number}</span>
          )}
        </div>
      ))}
    </div>
  );
}
