import { useEffect, useRef } from "react";
import type { PuzzleClue } from "../../types/puzzle";

interface CluePanelProps {
  clues: PuzzleClue[];
  activeClue: PuzzleClue | null;
  onClueClick: (clue: PuzzleClue) => void;
}

export function CluePanel({ clues, activeClue, onClueClick }: CluePanelProps) {
  const acrossClues = clues.filter((c) => c.direction === "across");
  const downClues = clues.filter((c) => c.direction === "down");

  return (
    <div className="flex flex-col md:flex-row gap-3 h-full">
      <ClueList
        title="Across"
        clues={acrossClues}
        activeClue={activeClue}
        onClueClick={onClueClick}
      />
      <ClueList
        title="Down"
        clues={downClues}
        activeClue={activeClue}
        onClueClick={onClueClick}
      />
    </div>
  );
}

function ClueList({
  title,
  clues,
  activeClue,
  onClueClick,
}: {
  title: string;
  clues: PuzzleClue[];
  activeClue: PuzzleClue | null;
  onClueClick: (clue: PuzzleClue) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const el = activeRef.current;
    const container = listRef.current;
    if (!el || !container) return;
    // Scroll within the clue list only — avoid scrollIntoView which can
    // scroll the entire page on mobile, hiding the grid.
    const elTop = el.offsetTop - container.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    if (elTop < container.scrollTop) {
      container.scrollTo({ top: elTop, behavior: "smooth" });
    } else if (elBottom > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: elBottom - container.clientHeight, behavior: "smooth" });
    }
  }, [activeClue]);

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <h3 className="font-bold text-xs uppercase tracking-wide text-neutral-500 mb-0.5 shrink-0">
        {title}
      </h3>
      <ul ref={listRef} className="overflow-y-auto min-h-0">
        {clues.map((clue) => {
          const isActive =
            activeClue?.number === clue.number &&
            activeClue?.direction === clue.direction;
          return (
            <li
              key={`${clue.direction}-${clue.number}`}
              ref={isActive ? activeRef : undefined}
              className={`px-1 py-px rounded text-xs leading-tight cursor-pointer transition-colors ${
                isActive
                  ? "bg-blue-100 text-blue-900 font-medium"
                  : "hover:bg-neutral-100"
              }`}
              onClick={() => onClueClick(clue)}
            >
              <span className="font-semibold mr-1">{clue.number}.</span>
              {clue.text}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
