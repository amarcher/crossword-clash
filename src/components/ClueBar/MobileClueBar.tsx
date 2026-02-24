import { useEffect, useRef } from "react";
import type { PuzzleClue, Direction } from "../../types/puzzle";

interface MobileClueBarProps {
  activeClue: PuzzleClue | null;
  direction: Direction;
  onPrevWord: () => void;
  onNextWord: () => void;
  onOpenSheet: () => void;
  onToggleDirection: () => void;
}

export function MobileClueBar({
  activeClue,
  direction,
  onPrevWord,
  onNextWord,
  onOpenSheet,
  onToggleDirection,
}: MobileClueBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  // Keep the clue bar above the virtual keyboard using the VisualViewport API.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      if (!barRef.current) return;
      // When keyboard is open, visualViewport is smaller than the layout viewport.
      // Position the bar at the bottom of the visible area.
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      barRef.current.style.bottom = `${Math.max(0, offset)}px`;
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <div
      ref={barRef}
      className="md:hidden fixed left-0 right-0 bottom-0 flex items-stretch h-12 bg-white border-t border-neutral-200 z-50"
    >
      <button
        onClick={onPrevWord}
        className="w-11 flex items-center justify-center text-neutral-500 active:bg-neutral-100 shrink-0"
        aria-label="Previous clue"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <button
        onClick={onToggleDirection}
        className="shrink-0 flex items-center justify-center px-1.5 active:bg-neutral-100"
        aria-label={`Direction: ${direction === "across" ? "Across" : "Down"}, tap to toggle`}
      >
        <span
          className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded ${
            direction === "across"
              ? "bg-blue-100 text-blue-700"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {direction === "across" ? "A" : "D"}
        </span>
      </button>

      <button
        onClick={onOpenSheet}
        className="flex-1 min-w-0 flex items-center text-left px-2 active:bg-blue-50"
      >
        {activeClue ? (
          <span className="text-sm font-medium text-neutral-800 line-clamp-2 leading-tight">
            {activeClue.number}. {activeClue.text}
          </span>
        ) : (
          <span className="text-sm text-neutral-400">Tap a cell to start</span>
        )}
      </button>

      <button
        onClick={onNextWord}
        className="w-11 flex items-center justify-center text-neutral-500 active:bg-neutral-100 shrink-0"
        aria-label="Next clue"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
