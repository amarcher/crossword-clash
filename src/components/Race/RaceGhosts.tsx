import { useTranslation } from "react-i18next";
import { formatDuration } from "../../lib/soloStats";
import type { Ghost, GhostFrame } from "../../lib/race";

interface RaceGhostsProps {
  ghosts: readonly Ghost[];
  frames: readonly GhostFrame[];
  /** The squares that take a letter, for each ghost's fill bar. */
  totalCells: number;
}

/**
 * The race under the header: one row per ghost with its colour (the tint it
 * leaves on the grid), its name, how much of the grid it has filled, and its
 * time once it finishes.
 */
export function RaceGhosts({ ghosts, frames, totalCells }: RaceGhostsProps) {
  const { t } = useTranslation();
  return (
    <ul aria-label={t("ghostRace.ghostsLabel")} className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {ghosts.map((g, i) => {
        const frame = frames[i];
        const share = totalCells ? Math.min(1, (frame?.filled.size ?? 0) / totalCells) : 0;
        return (
          <li key={g.userId} className="flex min-w-0 items-center gap-2 text-xs">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: g.color }} aria-hidden="true" />
            <span className="max-w-28 truncate font-semibold text-ink">{g.name}</span>
            {frame?.finished ? (
              <span className="font-mono font-semibold tabular-nums text-ink-soft">{t("ghostRace.finishedAt", { time: formatDuration(g.seconds) })}</span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label={t("ghostRace.progressLabel", { name: g.name })}>
                  <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, backgroundColor: g.color }} />
                </span>
                <span className="font-mono tabular-nums text-muted">{Math.round(share * 100)}%</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
