import { Check, RotateCcw, X } from "lucide-react";
import type { Viability } from "../../lib/seedgrid/ingrid";

interface CandidatePanelProps {
  slotLabel: string;
  pattern: string;
  words: { word: string; score: number }[] | null;
  viability: Record<string, Viability>;
  approved: string[];
  rejected: string[];
  onPlace: (word: string) => void;
  onApprove: (word: string) => void;
  /** Toggles: rejects a word everywhere, or restores one already rejected. */
  onReject: (word: string) => void;
  onClearApprovals: () => void;
}

const DOT: Record<Viability, string> = {
  good: "bg-emerald-500",
  nogood: "bg-red-500",
  unknown: "border border-subtle",
};
const DOT_LABEL: Record<Viability, string> = {
  good: "A whole grid fills with this word",
  nogood: "No whole grid fills with this word",
  unknown: "Not checked yet",
};

const ICON_BUTTON =
  "inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-ink active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500";

/** Sort key: words a background fill has proven impossible sink below the rest. */
const ORDER: Record<Viability, number> = { good: 0, unknown: 0, nogood: 1 };

/**
 * Ingrid-style option list for the selected entry: every word that fits the
 * crossings, best score first, with a dot once a background fill has proven
 * the word good (a whole grid completes with it) or impossible (none does;
 * those sink to the bottom, struck through). Approving narrows the slot to
 * the approved words; rejecting bans a word everywhere, and the "Rejected"
 * list at the bottom is where a ban is undone, since a rejected word may no
 * longer appear in the list above.
 */
export function CandidatePanel({ slotLabel, pattern, words, viability, approved, rejected, onPlace, onApprove, onReject, onClearApprovals }: CandidatePanelProps) {
  // Approved words first (they're all the engine will use), then by score, with proven-impossible words last.
  const rest = words
    ? words.filter((o) => !approved.includes(o.word)).sort((a, b) => ORDER[viability[a.word] ?? "unknown"] - ORDER[viability[b.word] ?? "unknown"] || b.score - a.score)
    : [];
  const rows = words ? [...approved.map((w) => words.find((o) => o.word === w) ?? { word: w, score: 0 }), ...rest] : [];
  return (
    <section aria-label="Candidates" className="flex min-h-0 flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-ink">{slotLabel}</h2>
        <span className="font-mono text-sm tracking-[0.2em] text-muted" title="The entry so far; dots are empty squares">{pattern}</span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" aria-label="Legend">
        <span className="inline-flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${DOT.good}`} aria-hidden="true" /> fills a whole grid
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${DOT.nogood}`} aria-hidden="true" /> can't
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${DOT.unknown}`} aria-hidden="true" /> not checked yet
        </span>
        <span>✓ use only approved words here · ✕ never use this word</span>
      </p>
      {approved.length > 0 && (
        <p className="mt-1 flex items-center justify-between text-sm text-ink-soft">
          Only {approved.length} approved {approved.length === 1 ? "word" : "words"} will be used here.
          <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={onClearApprovals}>
            Clear
          </button>
        </p>
      )}
      <ul className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface">
        {words === null && <li className="p-3 text-sm text-muted">Looking for options…</li>}
        {words?.length === 0 && (
          <li className="p-3 text-sm leading-relaxed text-muted">
            No word fits every crossing. On the heatmap a red square has no letter that works at all; a white one still has letters, just no single word that satisfies all of its crossings. Change a crossing, or make a square black (right-click it).
          </li>
        )}
        {rows.map(({ word, score }) => {
          const v = viability[word];
          const isApproved = approved.includes(word);
          const isRejected = rejected.includes(word);
          return (
            <li key={word} className={`flex items-center gap-2 border-b border-line px-2 last:border-b-0 ${isApproved ? "bg-emerald-50" : ""}`}>
              <span className={`size-2.5 shrink-0 rounded-full ${v ? DOT[v] : ""}`} title={v ? DOT_LABEL[v] : "Checking"} aria-label={v ? DOT_LABEL[v] : undefined} />
              <button
                type="button"
                className={`min-h-11 flex-1 text-left font-mono text-[15px] tracking-wide ${v === "nogood" || isRejected ? "text-subtle line-through" : "text-ink"} hover:text-brand-700`}
                onClick={() => onPlace(word)}
                title={isRejected ? "Rejected everywhere; ✕ again restores it" : v === "nogood" ? "No whole grid fills with this word; write it anyway and change the crossings" : "Write into the grid"}
              >
                {word}
              </button>
              <span className="w-7 text-right text-xs tabular-nums text-subtle">{score || ""}</span>
              <button type="button" className={`${ICON_BUTTON} ${isApproved ? "text-emerald-700" : ""}`} aria-pressed={isApproved} aria-label={`Approve ${word}`} title="Use only approved words in this entry" onClick={() => onApprove(word)}>
                <Check className="size-4" aria-hidden="true" />
              </button>
              <button type="button" className={`${ICON_BUTTON} ${isRejected ? "text-red-600" : ""}`} aria-pressed={isRejected} aria-label={isRejected ? `Restore ${word}` : `Reject ${word}`} title={isRejected ? "Restore this word" : "Never use this word anywhere in the puzzle"} onClick={() => onReject(word)}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {rejected.length > 0 && (
        <details className="mt-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold text-ink-soft">
            Rejected everywhere ({rejected.length})
          </summary>
          <ul className="mt-1 flex flex-col">
            {rejected.map((word) => (
              <li key={word} className="flex items-center justify-between gap-2 py-0.5">
                <span className="font-mono text-[15px] tracking-wide text-subtle line-through">{word}</span>
                <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-surface-sunken" onClick={() => onReject(word)}>
                  <RotateCcw className="size-3.5" aria-hidden="true" /> Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
