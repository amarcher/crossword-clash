import { memo, useMemo, useRef, type KeyboardEvent } from "react";
import { slotsOf, type Grid } from "../../lib/seedgrid/grid";
import { heatLevel } from "../../lib/seedgrid/studioState";

interface StudioGridProps {
  grid: Grid;
  cursor: number;
  activeCells: number[];
  /** Per cell, the fewest options through it; undefined hides the heatmap. */
  heat?: (number | undefined)[];
  onSelect: (cell: number) => void;
  onKey: (e: KeyboardEvent<HTMLInputElement>) => void;
  onLetters: (letters: string) => void;
  onErase: () => void;
}

/**
 * The hidden input always holds this zero-width character, so a soft-keyboard
 * Backspace has something to delete. Android keyboards often report it only
 * as an input change (keyCode 229), never as a Backspace keydown.
 */
const SENTINEL = "\u200b";

const HEAT_BG = { dead: "bg-red-200", tight: "bg-orange-100", snug: "bg-amber-50", open: "bg-surface" } as const;

/**
 * Editable construction grid. Keys go through one visually hidden input so
 * phones get a keyboard and desktops get arrows, Backspace and "." for blocks.
 */
export const StudioGrid = memo(function StudioGrid({ grid, cursor, activeCells, heat, onSelect, onKey, onLetters, onErase }: StudioGridProps) {
  const input = useRef<HTMLInputElement>(null);
  const numbers = useMemo(() => {
    const out = new Map<number, number>();
    for (const s of slotsOf(grid)) if (!out.has(s.cells[0])) out.set(s.cells[0], s.number);
    return out;
  }, [grid]);
  const active = useMemo(() => new Set(activeCells), [activeCells]);
  const w = grid.width;

  return (
    <div className="@container relative w-full">
      <input
        ref={input}
        aria-label="Grid entry"
        className="absolute top-0 left-0 size-px opacity-0 text-base"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={SENTINEL}
        onKeyDown={onKey}
        onChange={(e) => {
          const value = e.target.value;
          if (!value.includes(SENTINEL)) onErase();
          else onLetters(value.split(SENTINEL).join(""));
        }}
      />
      <div
        role="grid"
        aria-label="Puzzle grid"
        className="grid gap-px rounded-lg border-2 border-ink bg-ink select-none touch-manipulation"
        style={{ gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))` }}
      >
        {grid.cells.map((cell, i) => {
          if (cell === "#") {
            return (
              <div
                key={i}
                role="gridcell"
                aria-label="Block"
                aria-selected={i === cursor}
                className={`aspect-square bg-ink ${i === cursor ? "outline-3 -outline-offset-3 outline-gold-400" : ""}`}
                onClick={() => {
                  onSelect(i);
                  input.current?.focus();
                }}
              />
            );
          }
          const bg = i === cursor ? "bg-gold-400" : active.has(i) ? "bg-gold-100" : heat ? HEAT_BG[heatLevel(heat[i])] : "bg-surface";
          return (
            <div
              key={i}
              role="gridcell"
              aria-selected={i === cursor}
              className={`relative aspect-square flex items-center justify-center ${bg} cursor-pointer`}
              onClick={() => {
                onSelect(i);
                input.current?.focus();
              }}
            >
              {numbers.has(i) && (
                <span className="absolute top-[3%] left-[6%] leading-none text-ink-soft font-semibold" style={{ fontSize: `${26 / w}cqi` }}>
                  {numbers.get(i)}
                </span>
              )}
              <span
                className={`leading-none uppercase ${grid.locked[i] ? "font-bold text-ink" : "font-medium text-brand-600"}`}
                style={{ fontSize: `${56 / w}cqi` }}
              >
                {cell}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
