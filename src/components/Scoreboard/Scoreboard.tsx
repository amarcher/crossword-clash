import { useTranslation } from "react-i18next";

interface ScoreboardProps {
  score: number;
  totalCells: number;
  /** Unused: kept so callers need not change. */
  isComplete?: boolean;
}

// The header's "Solved" chip says a puzzle is finished; this only counts cells.
export function Scoreboard({ score, totalCells }: ScoreboardProps) {
  const { t } = useTranslation();
  const pct = totalCells > 0 ? Math.round((score / totalCells) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs md:text-sm tabular-nums">
        <span className="text-muted">
          {t('scoreboard.cells', { score, total: totalCells })}
        </span>
        <span className="font-semibold text-ink-soft">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden" role="progressbar" aria-label={t('scoreboard.cells', { score, total: totalCells })} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
