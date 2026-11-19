import { Check } from "lucide-react";

/** MiniGridThumb's look, drawn from the index's block string so no puzzle is fetched to show a shape. */
export function ShapeThumb({ blocks, className = "", solved = false }: { blocks: string; className?: string; solved?: boolean }) {
  const rows = blocks.split("/");
  const width = rows[0]?.length || 1;
  const last = rows.length - 1;
  return (
    <div
      aria-hidden="true"
      className={`relative grid gap-px rounded-md bg-ink p-px ${className}`}
      style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`, aspectRatio: `${width} / ${rows.length}` }}
    >
      {rows.flatMap((row, r) =>
        [...row].map((ch, c) => (
          <div
            key={`${r}-${c}`}
            className={`${ch === "#" ? "bg-ink" : solved ? "bg-brand-200" : "bg-surface"} ${r === 0 && c === 0 ? "rounded-tl-[5px]" : ""} ${r === 0 && c === width - 1 ? "rounded-tr-[5px]" : ""} ${r === last && c === 0 ? "rounded-bl-[5px]" : ""} ${r === last && c === width - 1 ? "rounded-br-[5px]" : ""}`}
          />
        )),
      )}
      {/* Solved: the squares filled and a check over the grid, as on the menu's daily cards (MiniGridThumb). */}
      {solved && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid size-[42%] place-items-center rounded-full bg-brand-600 text-white shadow-raised ring-2 ring-white">
            <Check className="size-[62%]" strokeWidth={3.5} />
          </span>
        </span>
      )}
    </div>
  );
}
