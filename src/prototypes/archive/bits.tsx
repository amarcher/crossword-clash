/**
 * PROTOTYPE — throwaway. Small shared pieces for the archive variants: the
 * grid-shape thumbnail drawn from an index entry's `blocks`, the status chip,
 * and the slot label.
 */
import { useTranslation } from "react-i18next";
import { Check, Clock } from "lucide-react";
import { formatDuration } from "../../lib/soloStats";
import type { DailySlot } from "../../lib/dailyFeed";
import type { ArchiveItem } from "./archiveData";

const SLOT_KEY = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const;

export function useSlotLabel(): (slot: DailySlot) => string {
  const { t } = useTranslation();
  return (slot) => t(SLOT_KEY[slot]);
}

/** MiniGridThumb's look, from the index's block string (no puzzle fetch). */
export function ShapeThumb({ blocks, className = "" }: { blocks: string; className?: string }) {
  const rows = blocks.split("/");
  const width = rows[0]?.length ?? 1;
  return (
    <div
      aria-hidden="true"
      className={`grid gap-px rounded-md bg-ink p-px ${className}`}
      style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`, aspectRatio: `${width} / ${rows.length}` }}
    >
      {rows.flatMap((row, r) =>
        [...row].map((ch, c) => <div key={`${r}-${c}`} className={`${ch === "#" ? "bg-ink" : "bg-surface"} ${r === 0 && c === 0 ? "rounded-tl-[5px]" : ""} ${r === 0 && c === width - 1 ? "rounded-tr-[5px]" : ""} ${r === rows.length - 1 && c === 0 ? "rounded-bl-[5px]" : ""} ${r === rows.length - 1 && c === width - 1 ? "rounded-br-[5px]" : ""}`} />),
      )}
    </div>
  );
}

/** Solved → brand chip with the time; in progress → gold chip; unsolved → nothing. Text + icon, never colour alone. */
export function StatusChip({ item, className = "" }: { item: Pick<ArchiveItem, "status" | "seconds">; className?: string }) {
  if (item.status === "solved") {
    return (
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 tabular-nums ring-1 ring-brand-100 ${className}`}>
        <Check className="size-3.5" aria-hidden="true" />
        {item.seconds !== null ? formatDuration(item.seconds) : "Solved"}
      </span>
    );
  }
  if (item.status === "inprogress") {
    return (
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-gold-50 px-2 py-0.5 text-xs font-semibold text-gold-700 ring-1 ring-gold-100 ${className}`}>
        <Clock className="size-3.5" aria-hidden="true" />
        In progress
      </span>
    );
  }
  return null;
}

/** What the primary button says for an item. */
export function primaryLabel(item: Pick<ArchiveItem, "status">): string {
  return item.status === "solved" ? "Play again" : item.status === "inprogress" ? "Resume" : "Play";
}

export function statusText(item: Pick<ArchiveItem, "status" | "seconds">): string {
  return item.status === "solved"
    ? `solved in ${item.seconds !== null ? formatDuration(item.seconds) : "a race"}`
    : item.status === "inprogress"
      ? "in progress"
      : "unsolved";
}
