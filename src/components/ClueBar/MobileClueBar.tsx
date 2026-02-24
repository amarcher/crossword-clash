import type { PuzzleClue, Direction } from "../../types/puzzle";

interface MobileClueBarProps {
  activeClue: PuzzleClue | null;
  direction: Direction;
  onPrevWord: () => void;
  onNextWord: () => void;
  onOpenSheet: () => void;
}

export function MobileClueBar({
  activeClue,
  direction,
  onPrevWord,
  onNextWord,
  onOpenSheet,
}: MobileClueBarProps) {
  return (
    <div className="md:hidden flex items-center gap-1 h-10 px-2 bg-white border-t border-neutral-200 shrink-0">
      <button
        onClick={onPrevWord}
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-neutral-500 active:bg-neutral-100"
        aria-label="Previous clue"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        onClick={onOpenSheet}
        className="flex-1 min-w-0 text-left px-2 py-1 rounded active:bg-blue-50"
      >
        {activeClue ? (
          <span className="text-sm font-medium text-blue-800 line-clamp-1">
            {activeClue.number}-{direction === "across" ? "A" : "D"}: {activeClue.text}
          </span>
        ) : (
          <span className="text-sm text-neutral-400">Tap a cell to start</span>
        )}
      </button>
      <button
        onClick={onNextWord}
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-neutral-500 active:bg-neutral-100"
        aria-label="Next clue"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
