import { memo, useId, useMemo } from "react";
import { slotsOf, type Grid } from "../../lib/seedgrid/grid";
import { heatLevel } from "../../lib/seedgrid/studioState";
import { useHiddenGridInput, type HiddenGridInputHandlers } from "../../hooks/useHiddenGridInput";

interface StudioGridProps {
  grid: Grid;
  cursor: number;
  direction: "across" | "down";
  activeCells: number[];
  /** Per cell, the fewest options through it; undefined hides the heatmap. */
  heat?: (number | undefined)[];
  onSelect: (cell: number) => void;
  /** Keyboard handlers for the hidden input (letters, erase, arrows, space, "."). */
  input: HiddenGridInputHandlers;
}

/**
 * Heat sits on a cool, neutral ramp so gold is reserved for the selection: a
 * snug run must never read as a second highlighted word.
 */
const HEAT_BG = { dead: "bg-red-200", tight: "bg-brand-100", snug: "bg-surface-sunken", open: "bg-surface" } as const;
/**
 * On the active word the gold fill wins, so those cells carry their heat as a
 * corner dot instead (a translucent gold wash over the heat turned to khaki).
 */
const HEAT_DOT = { dead: "bg-red-500", tight: "bg-brand-500", snug: "bg-subtle", open: null } as const;

/**
 * Editable construction grid. Keys go through one visually hidden input so
 * phones get a keyboard and desktops get arrows, Backspace and "." for blocks.
 */
export const StudioGrid = memo(function StudioGrid({ grid, cursor, direction, activeCells, heat, onSelect, input }: StudioGridProps) {
  const gridId = useId();
  const cellId = (i: number) => `${gridId}-${i}`;
  const { inputProps, focus } = useHiddenGridInput(input, {
    label: "Grid entry",
    activeDescendant: cellId(cursor),
    controls: gridId,
  });
  const numbers = useMemo(() => {
    const out = new Map<number, number>();
    for (const s of slotsOf(grid)) if (!out.has(s.cells[0])) out.set(s.cells[0], s.number);
    return out;
  }, [grid]);
  const active = useMemo(() => new Set(activeCells), [activeCells]);
  const w = grid.width;
  const place = (i: number) => `Row ${Math.floor(i / w) + 1}, Column ${(i % w) + 1}`;

  return (
    <div className="grid-shell @container relative w-full">
      <input {...inputProps} />
      <div
        id={gridId}
        role="grid"
        aria-label="Puzzle grid"
        className="grid gap-px overflow-hidden rounded-lg border-2 border-ink bg-ink select-none touch-manipulation"
        style={{ gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))` }}
      >
        {grid.cells.map((cell, i) => {
          const isCursor = i === cursor;
          if (cell === "#") {
            // A block under the cursor has no word to tint, so the gold outline
            // alone was easy to lose on a 15×15. A gold disc carrying the
            // direction glyph says both "you are here" and "which way".
            return (
              <div
                key={i}
                id={cellId(i)}
                role="gridcell"
                aria-label={`${place(i)}, block`}
                aria-selected={isCursor}
                className={`relative aspect-square bg-ink cursor-pointer ${isCursor ? "outline-3 -outline-offset-3 outline-gold-400" : ""}`}
                onClick={() => {
                  onSelect(i);
                  focus();
                }}
              >
                {isCursor && (
                  <span
                    aria-hidden="true"
                    data-testid="block-cursor"
                    className="absolute inset-0 m-auto flex items-center justify-center rounded-full bg-gold-400 text-ink leading-none"
                    style={{
                      width: `clamp(12px, ${48 / w}cqi, 28px)`,
                      height: `clamp(12px, ${48 / w}cqi, 28px)`,
                      fontSize: `clamp(8px, ${30 / w}cqi, 18px)`,
                    }}
                  >
                    {direction === "across" ? "▸" : "▾"}
                  </span>
                )}
              </div>
            );
          }
          const isActive = active.has(i);
          const level = heat ? heatLevel(heat[i]) : "open";
          const dot = isCursor || isActive ? HEAT_DOT[level] : null;
          // A plain open cell takes a faint sunken tint under a mouse (`hover:` is
          // gated on `@media (hover: hover)` by Tailwind); nothing transitions.
          const bg = isCursor ? "bg-gold-400" : isActive ? "bg-gold-100" : level === "open" ? "bg-surface hover:bg-surface-sunken" : HEAT_BG[level];
          // Every letter on the cursor cell is ink: brand blue on gold misses AA contrast,
          // so there the engine/locked distinction is carried by weight alone.
          const letter = grid.locked[i] ? "font-bold text-ink" : isCursor ? "font-medium text-ink" : "font-medium text-brand-600";
          const parts = [place(i)];
          if (numbers.has(i)) parts.push(String(numbers.get(i)));
          if (cell) parts.push(cell.toUpperCase());
          return (
            <div
              key={i}
              id={cellId(i)}
              role="gridcell"
              aria-label={parts.join(", ")}
              aria-selected={isCursor}
              className={`relative aspect-square flex items-center justify-center ${bg} cursor-pointer`}
              onClick={() => {
                onSelect(i);
                focus();
              }}
            >
              {numbers.has(i) && (
                <span
                  aria-hidden="true"
                  className="absolute top-[3%] left-[6%] leading-none text-ink-soft font-semibold"
                  style={{ fontSize: `min(${26 / w}cqi, 1rem)` }}
                >
                  {numbers.get(i)}
                </span>
              )}
              {dot && (
                <span
                  aria-hidden="true"
                  className={`absolute top-[8%] right-[8%] rounded-full ${dot}`}
                  style={{ width: `clamp(5px, ${18 / w}cqi, 10px)`, height: `clamp(5px, ${18 / w}cqi, 10px)` }}
                />
              )}
              <span aria-hidden="true" className={`leading-none uppercase ${letter}`} style={{ fontSize: `${56 / w}cqi` }}>
                {cell}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
