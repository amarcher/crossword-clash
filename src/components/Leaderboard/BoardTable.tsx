import { useTranslation } from "react-i18next";
import { Flag, Play } from "lucide-react";
import { PlusBadgeFor } from "../ui/PlusBadge";
import { formatDuration } from "../../lib/soloStats";
import type { RankedDailyEntry } from "../../lib/dailyLeaderboard";

const MEDAL: Record<number, string> = {
  1: "bg-gold-400 text-ink shadow-[0_1px_0_rgb(255_255_255/0.5)_inset]",
  2: "bg-gold-100 text-gold-700 ring-1 ring-gold-400/50",
  3: "bg-gold-50 text-gold-700 ring-1 ring-gold-100",
};

interface BoardTableProps {
  rows: readonly RankedDailyEntry[];
  /** The viewer: their row is tinted and marked "You". */
  userId?: string | null;
  /** Players whose recorded solve the viewer may race (race.ts); a Race button on their rows. */
  raceable?: ReadonlySet<string>;
  onRace?: (userId: string) => void;
  /** Players whose recorded solve the viewer may watch: a Watch button on their rows, once the viewer has solved the puzzle. */
  watchable?: ReadonlySet<string>;
  onWatch?: (userId: string) => void;
}

/**
 * A row's action. Drawn as a button (a border, a shadow, a white face), never
 * as a tinted pill: beside the row's tags a pill read as one more tag, "they
 * did a race", and nobody pressed it (Andrew, 2026-11-16).
 */
const ROW_ACTION =
  "inline-flex min-h-9 items-center gap-1 rounded-lg border border-brand-200 bg-surface px-2.5 font-sans text-xs font-semibold text-brand-700 shadow-card hover:bg-brand-50 active:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500";

/** A board's ranked rows: the dailies' boards and the bonus board draw the same table. */
export function BoardTable({ rows, userId, raceable, onRace, watchable, onWatch }: BoardTableProps) {
  const { t } = useTranslation();
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line bg-surface-sunken/60 text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
          <th scope="col" className="w-14 py-2.5 pl-4 pr-2 text-left">#</th>
          <th scope="col" className="w-full px-2 py-2.5 text-left">{t("completion.player")}</th>
          <th scope="col" className="py-2.5 pl-2 pr-4 text-right">{t("leaderboard.time")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((e) => {
          const isMe = userId === e.userId;
          return (
            <tr
              key={e.userId}
              data-unposted={e.unposted || undefined}
              // Every row is as tall as one with a Watch button, so a board is evenly spaced.
              className={`h-14 ${e.unposted ? "bg-surface-sunken/70 font-semibold text-ink" : isMe ? "bg-brand-50 font-semibold text-ink" : "text-ink-soft"}`}
            >
              <td className="py-2.5 pl-4 pr-2">
                <span
                  className={`grid size-8 place-items-center rounded-full text-sm font-bold tabular-nums ${
                    e.unposted ? "border border-dashed border-brand-500 text-brand-700" : MEDAL[e.rank] ?? "text-muted"
                  }`}
                >
                  {e.rank > 0 ? e.rank : "–"}
                </span>
              </td>
              {/* w-full + max-w-0: the name column takes what the rank and time leave and truncates inside it. Without w-full it collapsed to a few letters on a phone. */}
              <td className="w-full max-w-0 px-2 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  {/* The viewer's unposted time is simply "You": beside its chip a name had no room. */}
                  <span className={e.unposted ? "shrink-0" : "truncate"}>{e.unposted ? t("leaderboard.you") : e.displayName}</span>
                  {!e.unposted && <PlusBadgeFor userId={e.userId} />}
                  {isMe && !e.unposted && (
                    <span className="shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      {t("leaderboard.you")}
                    </span>
                  )}
                  {e.unposted ? (
                    <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted ring-1 ring-line">
                      {t("leaderboard.notOnBoard")}
                    </span>
                  ) : (
                    // Both tags are quiet: the brand colour on a row belongs to its action.
                    <span className="hidden shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted min-[380px]:inline">
                      {e.mode === "race" ? t("leaderboard.modeRace") : t("leaderboard.modeSolo")}
                    </span>
                  )}
                  {e.autocheck === false && (
                    <span className="shrink-0 rounded-full bg-gold-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-700">
                      {t("autocheck.noAutocheck")}
                    </span>
                  )}
                </div>
              </td>
              <td className="whitespace-nowrap py-2.5 pl-2 pr-4 text-right font-mono tabular-nums">
                <span className="inline-flex items-center justify-end gap-2">
                  {!isMe && onRace && raceable?.has(e.userId) && (
                    <button
                      type="button"
                      onClick={() => onRace(e.userId)}
                      aria-label={t("ghostRace.raceRow", { name: e.displayName })}
                      className={ROW_ACTION}
                    >
                      <Flag className="size-3.5" aria-hidden="true" />
                      {t("ghostRace.raceButton")}
                    </button>
                  )}
                  {!isMe && onWatch && watchable?.has(e.userId) && (
                    <button type="button" onClick={() => onWatch(e.userId)} aria-label={t("ghostRace.watchRow", { name: e.displayName })} className={ROW_ACTION}>
                      <Play className="size-3.5" aria-hidden="true" />
                      {t("ghostRace.watchButton")}
                    </button>
                  )}
                  {formatDuration(e.seconds)}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
