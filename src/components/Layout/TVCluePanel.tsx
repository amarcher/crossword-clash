import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { PuzzleClue } from "../../types/puzzle";

interface Props {
  clues: PuzzleClue[];
  completedClues?: Set<string>;
  completedCluesByPlayer?: Map<string, { playerId: string }>;
  playerColorMap?: Record<string, string>;
}

/** Read-only clue list for the TV. Completed clues are struck through with the solver's color;
 *  each list auto-scrolls so the first unsolved clue stays in view. */
export function TVCluePanel({ clues, completedClues, completedCluesByPlayer, playerColorMap }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-0 gap-4">
      {(["across", "down"] as const).map((dir) => (
        <ClueColumn
          key={dir}
          title={t(dir === "across" ? "cluePanel.across" : "cluePanel.down")}
          clues={clues.filter((c) => c.direction === dir)}
          completedClues={completedClues}
          completedCluesByPlayer={completedCluesByPlayer}
          playerColorMap={playerColorMap}
        />
      ))}
    </div>
  );
}

function ClueColumn({ title, clues, completedClues, completedCluesByPlayer, playerColorMap }: Props & { title: string }) {
  const listRef = useRef<HTMLUListElement>(null);
  const firstOpenRef = useRef<HTMLLIElement>(null);
  const isDone = (c: PuzzleClue) => {
    const k = `${c.direction}-${c.number}`;
    return Boolean(completedCluesByPlayer?.has(k) || completedClues?.has(k));
  };
  const firstOpen = clues.find((c) => !isDone(c));
  const firstOpenKey = firstOpen ? `${firstOpen.direction}-${firstOpen.number}` : "";

  useEffect(() => {
    const el = firstOpenRef.current;
    const list = listRef.current;
    if (!el || !list) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ top: Math.max(0, el.offsetTop - list.offsetTop - list.clientHeight * 0.25), behavior: reduce ? "instant" : "smooth" });
  }, [firstOpenKey]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <h2 className="tv-t-sm mb-2 shrink-0 font-bold uppercase tracking-[0.14em] text-gold-400">{title}</h2>
      <ul ref={listRef} className="tv-clue-list min-h-0 flex-1 space-y-1 overflow-y-auto">
        {clues.map((clue) => {
          const key = `${clue.direction}-${clue.number}`;
          const info = completedCluesByPlayer?.get(key);
          const done = isDone(clue);
          const color = info ? playerColorMap?.[info.playerId] : undefined;
          return (
            <li
              key={key}
              ref={clue === firstOpen ? firstOpenRef : undefined}
              className={`tv-clue flex gap-2 rounded-md border-l-4 px-2 py-1 ${done ? "text-slate-500 line-through decoration-2" : "text-slate-100"}`}
              style={{ borderLeftColor: done ? (color ?? "var(--color-stage-line)") : "transparent" }}
            >
              <span className={`shrink-0 font-bold tabular-nums ${done ? "" : "text-brand-200"}`}>{clue.number}</span>
              <span>{clue.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
