import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
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
  /** Right-click menu: make this square black, or white again (its symmetric partner follows). */
  onToggleBlock: (cell: number) => void;
  /** Right-click menu: switch between writing across and down. */
  onToggleDirection: () => void;
  /** Menu: show the candidate words for the entry through this square in that direction (the phone layout opens its Words tab). */
  onShowWords: (cell: number, direction: "across" | "down") => void;
  /** Keyboard handlers for the hidden input (letters, erase, arrows, space, "."). */
  input: HiddenGridInputHandlers;
}

/** A touch held this long on a square opens the menu (the right-click of a phone). */
export const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP_PX = 8;

const MENU_ITEM =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none";

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
 * phones get a keyboard and desktops get arrows, Backspace and "." for blocks;
 * a right-click on any square opens a small menu with the same two moves
 * (black square on / off, across / down), because "." was the only way to
 * place a block and nobody found it.
 */
export const StudioGrid = memo(function StudioGrid({ grid, cursor, direction, activeCells, heat, onSelect, onToggleBlock, onToggleDirection, onShowWords, input }: StudioGridProps) {
  const gridId = useId();
  // x / y are the press point inside the grid shell; `flip` opens the menu
  // leftwards when the press is in the right half, so a press near the right
  // edge (a phone's thumb lives there) never puts the menu off-screen.
  const [menu, setMenu] = useState<{ cell: number; x: number; y: number; flip: boolean } | null>(null);
  // Long-press bookkeeping: the timer, where the touch started, and whether a
  // press just opened the menu (so the click that follows a release does not
  // immediately close it or pull the keyboard up).
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const pressedRef = useRef(false);
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);
  const showMenu = (cell: number, target: HTMLElement, clientX: number, clientY: number) => {
    onSelect(cell);
    const box = (target.closest(".grid-shell") as HTMLElement | null)?.getBoundingClientRect();
    const x = clientX - (box?.left ?? 0);
    setMenu({ cell, x, y: clientY - (box?.top ?? 0), flip: !!box && x > box.width / 2 });
  };
  const openMenu = (cell: number) => (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    showMenu(cell, e.currentTarget, e.clientX, e.clientY);
  };
  // Touch and pen: hold a square to open the same menu (iOS fires no
  // contextmenu for a long press, and its callout is turned off in CSS).
  const pressStart = (cell: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    cancelPress();
    const target = e.currentTarget;
    const { clientX, clientY } = e;
    press.current = {
      x: clientX,
      y: clientY,
      timer: window.setTimeout(() => {
        press.current = null;
        pressedRef.current = true;
        showMenu(cell, target, clientX, clientY);
      }, LONG_PRESS_MS),
    };
  };
  const pressMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > LONG_PRESS_SLOP_PX) cancelPress();
  };
  const cellClick = (i: number) => () => {
    if (pressedRef.current) {
      // The release after a long press: the menu is up, leave it.
      pressedRef.current = false;
      return;
    }
    onSelect(i);
    focus();
  };
  const wordItems = useMemo(() => {
    if (!menu || grid.cells[menu.cell] === "#") return [];
    return slotsOf(grid)
      .filter((s) => s.cells.includes(menu.cell))
      .map((s) => ({ dir: s.dir, label: `Words for ${s.number} ${s.dir === "across" ? "Across" : "Down"}` }));
  }, [menu, grid]);
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
        className="grid gap-px overflow-hidden rounded-lg border-2 border-ink bg-ink select-none touch-manipulation [-webkit-touch-callout:none]"
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
                onClick={cellClick(i)}
                onContextMenu={openMenu(i)}
                onPointerDown={pressStart(i)}
                onPointerMove={pressMove}
                onPointerUp={cancelPress}
                onPointerCancel={cancelPress}
              >
                {isCursor && (
                  // "You are here" only: a direction glyph on a block meant
                  // nothing to anyone (there is no word to write through it).
                  <span
                    aria-hidden="true"
                    data-testid="block-cursor"
                    className="absolute inset-0 m-auto rounded-full bg-gold-400"
                    style={{
                      width: `clamp(12px, ${48 / w}cqi, 28px)`,
                      height: `clamp(12px, ${48 / w}cqi, 28px)`,
                    }}
                  />
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
              onClick={cellClick(i)}
              onContextMenu={openMenu(i)}
              onPointerDown={pressStart(i)}
              onPointerMove={pressMove}
              onPointerUp={cancelPress}
              onPointerCancel={cancelPress}
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
      {menu && (
        <div
          role="menu"
          aria-label="Square"
          className="absolute z-20 min-w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-overlay"
          style={menu.flip ? { right: `calc(100% - ${menu.x + 8}px)`, top: menu.y + 4 } : { left: Math.max(0, menu.x - 8), top: menu.y + 4 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM}
            onClick={() => {
              onToggleBlock(menu.cell);
              setMenu(null);
              focus();
            }}
          >
            {grid.cells[menu.cell] === "#" ? "Make this square white" : "Make this square black"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM}
            onClick={() => {
              onToggleDirection();
              setMenu(null);
              focus();
            }}
          >
            {direction === "across" ? "Write down ▾" : "Write across ▸"}
          </button>
          {wordItems.map((item) => (
            <button
              key={item.dir}
              type="button"
              role="menuitem"
              className={MENU_ITEM}
              onClick={() => {
                onShowWords(menu.cell, item.dir);
                setMenu(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
