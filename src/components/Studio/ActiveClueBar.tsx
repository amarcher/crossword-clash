interface ActiveClueBarProps {
  /** "1 Across". */
  slotLabel: string;
  answer: string;
  clue: string;
  onChange: (clue: string) => void;
}

/**
 * The phone's clue for the selected entry, under the grid: clue as you go
 * without leaving the Grid tab. The Clues tab holds the same text.
 */
export function ActiveClueBar({ slotLabel, answer, clue, onChange }: ActiveClueBarProps) {
  return (
    <label className="flex items-center gap-2 rounded-xl bg-surface-sunken px-3 py-1.5">
      <span className="flex shrink-0 flex-col text-xs leading-tight">
        <span className="font-semibold text-ink-soft">{slotLabel}</span>
        <span className="font-mono text-muted">{answer}</span>
      </span>
      <input
        className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-base text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500"
        aria-label={`Clue for ${slotLabel}`}
        placeholder="Write a clue"
        value={clue}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
