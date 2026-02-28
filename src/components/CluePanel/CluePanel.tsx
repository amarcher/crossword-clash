import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { PuzzleClue } from "../../types/puzzle";
import { blendOnWhite } from "../CrosswordGrid/Cell";

interface CluePanelProps {
  clues: PuzzleClue[];
  activeClue: PuzzleClue | null;
  onClueClick: (clue: PuzzleClue) => void;
  completedClues?: Set<string>;
  /** Map of clue key → completing player info (for player-colored strikethrough) */
  completedCluesByPlayer?: Map<string, { playerId: string }>;
  /** Player userId → hex color */
  playerColorMap?: Record<string, string>;
}

export function CluePanel({
  clues,
  activeClue,
  onClueClick,
  completedClues,
  completedCluesByPlayer,
  playerColorMap,
}: CluePanelProps) {
  const { t } = useTranslation();
  const acrossClues = clues.filter((c) => c.direction === "across");
  const downClues = clues.filter((c) => c.direction === "down");

  return (
    <div className="flex flex-col md:flex-row gap-3 h-full">
      <ClueList
        title={t('cluePanel.across')}
        clues={acrossClues}
        activeClue={activeClue}
        onClueClick={onClueClick}
        completedClues={completedClues}
        completedCluesByPlayer={completedCluesByPlayer}
        playerColorMap={playerColorMap}
      />
      <ClueList
        title={t('cluePanel.down')}
        clues={downClues}
        activeClue={activeClue}
        onClueClick={onClueClick}
        completedClues={completedClues}
        completedCluesByPlayer={completedCluesByPlayer}
        playerColorMap={playerColorMap}
      />
    </div>
  );
}

function ClueList({
  title,
  clues,
  activeClue,
  onClueClick,
  completedClues,
  completedCluesByPlayer,
  playerColorMap,
}: {
  title: string;
  clues: PuzzleClue[];
  activeClue: PuzzleClue | null;
  onClueClick: (clue: PuzzleClue) => void;
  completedClues?: Set<string>;
  completedCluesByPlayer?: Map<string, { playerId: string }>;
  playerColorMap?: Record<string, string>;
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
          const clueKey = `${clue.direction}-${clue.number}`;
          const isActive =
            activeClue?.number === clue.number &&
            activeClue?.direction === clue.direction;

          // Check completion via either prop (completedCluesByPlayer takes precedence)
          const byPlayerInfo = completedCluesByPlayer?.get(clueKey);
          const isCompleted = byPlayerInfo !== undefined || completedClues?.has(clueKey);

          // Resolve the player color for completed clues
          let completedBg: string | undefined;
          if (isCompleted && byPlayerInfo?.playerId && playerColorMap?.[byPlayerInfo.playerId]) {
            completedBg = blendOnWhite(playerColorMap[byPlayerInfo.playerId], 0.15);
          }

          return (
            <li
              key={clueKey}
              ref={isActive ? activeRef : undefined}
              className={`px-1 py-px rounded text-xs leading-tight cursor-pointer transition-colors ${
                isActive
                  ? "bg-blue-100 text-blue-900 font-medium"
                  : isCompleted && !completedBg
                    ? "text-neutral-400"
                    : isCompleted
                      ? ""
                      : "hover:bg-neutral-100"
              } ${isCompleted ? "line-through" : ""}`}
              style={
                completedBg && !isActive
                  ? { backgroundColor: completedBg, color: "#737373" }
                  : undefined
              }
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
