import { memo, useEffect, useRef } from "react";
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

export const CluePanel = memo(function CluePanel({
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
    <div className="flex flex-col xl:flex-row gap-3 md:gap-5 h-full min-h-0">
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
});

const ClueList = memo(function ClueList({
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
    const prefersReducedMotion = typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scrollBehavior: ScrollBehavior = prefersReducedMotion ? "instant" : "smooth";
    if (elTop < container.scrollTop) {
      container.scrollTo({ top: elTop, behavior: scrollBehavior });
    } else if (elBottom > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: elBottom - container.clientHeight, behavior: scrollBehavior });
    }
  }, [activeClue]);

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <h2 className="font-semibold text-xs uppercase tracking-[0.08em] text-subtle mb-1 md:mb-2 md:px-2 shrink-0">
        {title}
      </h2>
      <ul ref={listRef} className="overflow-y-auto overscroll-contain min-h-0">
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
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClueClick(clue); } }}
              className={`flex gap-1.5 px-1 py-px md:px-2 md:py-1.5 rounded md:rounded-lg text-xs md:text-[15px] leading-tight md:leading-snug cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                isActive
                  ? "bg-brand-100 text-brand-800 font-medium md:shadow-[inset_3px_0_0_var(--color-brand-600)]"
                  : isCompleted && !completedBg
                    ? "text-neutral-400"
                    : isCompleted
                      ? ""
                      : "text-ink-soft hover:bg-surface-sunken"
              } ${isCompleted ? "line-through" : ""}`}
              style={
                completedBg && !isActive
                  ? { backgroundColor: completedBg, color: "#737373" }
                  : undefined
              }
              onClick={() => onClueClick(clue)}
            >
              <span className="font-semibold tabular-nums md:min-w-6 md:text-right">{clue.number}</span>
              <span className="min-w-0">{clue.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
