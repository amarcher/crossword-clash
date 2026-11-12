import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ClueOptions } from "./CluePanel";

interface ActiveClueBarProps {
  /** "1 Across". */
  slotLabel: string;
  /** The entry so far; dots are empty squares. */
  answer: string;
  clue: string;
  onChange: (clue: string) => void;
  /** The previous / next entry, across then down, wrapping around. */
  onPrev: () => void;
  onNext: () => void;
  /** The AI's clues for this entry, if a draft has run. */
  options: string[];
}

/** A sideways swipe at least this long, and mostly sideways, changes the entry. */
const SWIPE_PX = 48;

const STEP =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500";

/**
 * The phone's clue for the selected entry, under the grid: clue as you go
 * without leaving the Grid tab, and swipe (or tap ‹ ›) to the previous or
 * next entry, the way the solver's clue bar moves. The Clues tab holds the
 * same text; the AI's options for the entry show as chips under it.
 */
export function ActiveClueBar({ slotLabel, answer, clue, onChange, onPrev, onNext, options }: ActiveClueBarProps) {
  const touch = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="flex touch-pan-y flex-col gap-1.5 rounded-xl bg-surface-sunken px-1.5 py-1.5"
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") touch.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const from = touch.current;
        touch.current = null;
        if (!from) return;
        const dx = e.clientX - from.x;
        const dy = e.clientY - from.y;
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (dx < 0) onNext();
        else onPrev();
      }}
      onPointerCancel={() => (touch.current = null)}
    >
      <div className="flex items-center gap-1">
        <button type="button" className={STEP} aria-label="Previous entry" onClick={onPrev}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex w-16 shrink-0 flex-col text-xs leading-tight">
            <span className="font-semibold text-ink-soft">{slotLabel}</span>
            <span className="truncate font-mono text-muted">{answer}</span>
          </span>
          <input
            className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-base text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500"
            aria-label={`Clue for ${slotLabel}`}
            placeholder="Write a clue"
            value={clue}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
        <button type="button" className={STEP} aria-label="Next entry" onClick={onNext}>
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>
      {options.length > 0 && <ClueOptions label={slotLabel} options={options} clue={clue} onPick={onChange} className="px-1" />}
    </div>
  );
}
