import { useTranslation } from "react-i18next";

interface ScoreboardProps {
  score: number;
  totalCells: number;
  isComplete: boolean;
}

export function Scoreboard({ score, totalCells, isComplete }: ScoreboardProps) {
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
      {isComplete && (
        <div className="text-center py-3 px-4 rounded-xl bg-gold-50 border border-gold-100">
          <p className="text-gold-700 font-semibold">{t('scoreboard.puzzleComplete')}</p>
        </div>
      )}
    </div>
  );
}
