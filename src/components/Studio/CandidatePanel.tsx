import { Check, X } from "lucide-react";
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
  onReject: (word: string) => void;
  onClearApprovals: () => void;
}

const DOT: Record<Viability, string> = {
  good: "bg-emerald-500",
  nogood: "bg-red-500",
  unknown: "border border-subtle",
};
const DOT_LABEL: Record<Viability, string> = {
  good: "Fills",
  nogood: "Can't fill",
  unknown: "Not proven either way",
};

const ICON_BUTTON =
  "inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-ink active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500";

/**
 * Ingrid-style option list for the selected entry: words that survive the
 * crossings, with a dot once a background fill has proven each one good or
 * impossible. Approving narrows the slot to approved words; rejecting bans a
 * word everywhere.
 */
export function CandidatePanel({ slotLabel, pattern, words, viability, approved, rejected, onPlace, onApprove, onReject, onClearApprovals }: CandidatePanelProps) {
  // Approved words first (they're all the engine will use), then by score.
  const rows = words ? [...approved.map((w) => words.find((o) => o.word === w) ?? { word: w, score: 0 }), ...words.filter((o) => !approved.includes(o.word))] : [];
  return (
    <section aria-label="Candidates" className="flex min-h-0 flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-ink">{slotLabel}</h2>
        <span className="font-mono text-sm tracking-[0.2em] text-muted">{pattern}</span>
      </div>
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
        {words?.length === 0 && <li className="p-3 text-sm text-muted">Nothing fits these crossings.</li>}
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
                title="Write into the grid"
              >
                {word}
              </button>
              <span className="w-7 text-right text-xs tabular-nums text-subtle">{score || ""}</span>
              <button type="button" className={`${ICON_BUTTON} ${isApproved ? "text-emerald-700" : ""}`} aria-pressed={isApproved} aria-label={`Approve ${word}`} onClick={() => onApprove(word)}>
                <Check className="size-4" aria-hidden="true" />
              </button>
              <button type="button" className={`${ICON_BUTTON} ${isRejected ? "text-red-600" : ""}`} aria-pressed={isRejected} aria-label={`Reject ${word}`} onClick={() => onReject(word)}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
