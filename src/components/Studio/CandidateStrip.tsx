import { ChevronRight } from "lucide-react";
import type { Viability } from "../../lib/seedgrid/ingrid";

interface CandidateStripProps {
  slotLabel: string;
  words: { word: string; score: number }[] | null;
  viability: Record<string, Viability>;
  rejected: string[];
  onPlace: (word: string) => void;
  /** Opens the full list (the phone's pull-up word list). */
  onMore: () => void;
  /** The entry has every letter: keep to one line, since the constructor is likely clueing now. */
  filled?: boolean;
}

/** How many words the strip offers before "All words": about two rows of chips at phone width. */
export function stripCount(length: number): number {
  return length <= 5 ? 6 : length <= 8 ? 4 : 2;
}

/**
 * The phone's shortcut under the grid: the best few words for the selected
 * entry as chips that wrap onto a second row (a sideways scroll hid that there
 * were more, 2026-11-11), then "All N words" for the full list. Proven-
 * impossible and rejected words are left out; approvals and rejections stay on
 * the full list. Once the entry is written it shrinks to the "Other words"
 * link alone, to leave the room to the clue bar.
 */
export function CandidateStrip({ slotLabel, words, viability, rejected, onPlace, onMore, filled = false }: CandidateStripProps) {
  const usable = (words ?? []).filter((o) => viability[o.word] !== "nogood" && !rejected.includes(o.word));
  const top = filled ? [] : usable.slice(0, stripCount(usable[0]?.word.length ?? 5));
  return (
    <div role="group" aria-label={`Words for ${slotLabel}`} className="flex flex-wrap items-center gap-1.5">
      {words === null && !filled && <span className="min-h-10 py-2.5 text-sm text-muted">Looking for words…</span>}
      {words?.length === 0 && <span className="min-h-10 py-2.5 text-sm text-muted">No word fits every crossing.</span>}
      {top.map(({ word }) => (
        <button
          key={word}
          type="button"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 font-mono text-sm tracking-wide text-ink hover:bg-surface-sunken active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500"
          onClick={() => onPlace(word)}
          aria-label={`Write ${word}`}
        >
          {viability[word] === "good" && <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />}
          {word}
        </button>
      ))}
      <button
        type="button"
        className="inline-flex min-h-10 items-center gap-0.5 rounded-full px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 active:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500"
        onClick={onMore}
      >
        {filled ? `Other words for ${slotLabel}` : words?.length ? `All ${words.length.toLocaleString()} words` : "All words"} <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
