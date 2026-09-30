import { Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Player } from "../../types/game";

interface Props {
  players: Player[];
  totalCells: number;
  isComplete: boolean;
  clueCountsByPlayer?: Map<string, number>;
  totalClues?: number;
}

/** Stage scoreboard: one row per player with a colored progress bar, ranked by score. */
export function TVScoreboard({ players, totalCells, isComplete, clueCountsByPlayer, totalClues }: Props) {
  const { t } = useTranslation();
  const showClues = clueCountsByPlayer && totalClues != null && totalClues > 0;
  const totalScore = players.reduce((s, p) => s + p.score, 0);
  const totalPct = totalCells > 0 ? Math.round((totalScore / totalCells) * 100) : 0;
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const hasWinner = isComplete && ranked.length > 0 && ranked[0].score > (ranked[1]?.score ?? 0);
  const cluesClaimed = showClues ? players.reduce((s, p) => s + (clueCountsByPlayer.get(p.userId) ?? 0), 0) : 0;

  return (
    <div className="tv-card" style={{ padding: "calc(var(--u) * 1.1)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="tv-t-sm text-slate-400">
          {t("scoreboard.cells", { score: totalScore, total: totalCells })}
          {showClues && <> · {t("scoreboard.clues", { score: cluesClaimed, total: totalClues })}</>}
        </p>
        <p className="tv-t-md font-display font-bold tabular-nums text-white">{totalPct}%</p>
      </div>
      <div
        className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-stage"
        role="progressbar"
        aria-label={t("scoreboard.cells", { score: totalScore, total: totalCells })}
        aria-valuenow={totalPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {players.map((p) => (
          <div
            key={p.userId}
            className="h-full transition-[width] duration-300"
            style={{ width: `${totalCells > 0 ? (p.score / totalCells) * 100 : 0}%`, backgroundColor: p.color }}
          />
        ))}
      </div>

      <ol className="mt-4 space-y-3">
        {ranked.map((p, i) => {
          const pct = totalCells > 0 ? (p.score / totalCells) * 100 : 0;
          const clues = clueCountsByPlayer?.get(p.userId) ?? 0;
          return (
            <li key={p.userId}>
              <div className="flex items-center gap-3">
                <span className="tv-t-md w-6 text-center font-display font-bold tabular-nums text-slate-500">
                  {hasWinner && i === 0 ? (
                    <Trophy className="mx-auto size-[1.1em] text-gold-400" aria-label={t("scoreboard.puzzleComplete")} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
                <span className="tv-t-lg min-w-0 flex-1 truncate font-semibold text-white">{p.displayName}</span>
                <span className="tv-t-md tabular-nums text-slate-300">
                  {showClues ? t("scoreboard.playerStats", { cells: p.score, clues }) : `${p.score} (${Math.round(pct)}%)`}
                </span>
              </div>
              <div className="ml-9 mt-1.5 h-1.5 overflow-hidden rounded-full bg-stage">
                <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, backgroundColor: p.color }} />
              </div>
            </li>
          );
        })}
      </ol>

      {isComplete && (
        <div className="mt-4 rounded-xl border border-gold-500/40 bg-gold-400/10 px-4 py-3 text-center">
          <p className="tv-t-lg font-display font-bold text-gold-400">{t("scoreboard.puzzleComplete")}</p>
          {ranked.length > 1 && ranked[0].score > ranked[1].score && (
            <p className="tv-t-md text-gold-100">{t("scoreboard.wins", { name: ranked[0].displayName })}</p>
          )}
          {ranked.length > 1 && ranked[0].score === ranked[1].score && <p className="tv-t-md text-gold-100">{t("scoreboard.tie")}</p>}
        </div>
      )}
    </div>
  );
}
