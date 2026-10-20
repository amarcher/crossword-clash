import { useTranslation } from "react-i18next";
import { CircleCheck, Share2, Trophy } from "lucide-react";
import { buttonClass } from "../ui";
import { formatDuration } from "../../lib/soloStats";

interface FinishedBarProps {
  /** The finish time; omitted for a finish with no personal time (a shared-grid race). */
  seconds?: number | null;
  /** Re-opens the completion modal (share card, challenge link, standings). */
  onShare: () => void;
  /** Present for a daily: goes straight to that day's board. */
  onLeaderboard?: () => void;
}

/**
 * The game header's finished state: a "Solved in 1:42" chip in place of the
 * running clock plus the two things a finisher still wants after the
 * celebration has been dismissed — the share card and the board. On phones the
 * actions are icon-only (their labels stay for assistive tech) so the row fits
 * beside the title.
 */
export function FinishedBar({ seconds, onShare, onLeaderboard }: FinishedBarProps) {
  const { t } = useTranslation();
  const hasTime = typeof seconds === "number";
  const label = hasTime ? t("playing.solvedIn", { time: formatDuration(seconds) }) : t("playing.solved");
  return (
    <div data-testid="finished-bar" className="flex items-center gap-2">
      <span
        aria-label={label}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gold-50 px-2.5 text-sm font-semibold text-gold-700 ring-1 ring-gold-100 tabular-nums"
      >
        <CircleCheck className="size-4 shrink-0 text-gold-500" aria-hidden="true" />
        <span aria-hidden="true">
          {hasTime ? (
            <>
              <span className="hidden md:inline">{label}</span>
              <span className="md:hidden">{formatDuration(seconds)}</span>
            </>
          ) : (
            label
          )}
        </span>
      </span>
      <button type="button" onClick={onShare} className={buttonClass("secondary", "sm", "max-md:px-2.5")}>
        <Share2 className="size-4" aria-hidden="true" />
        <span className="max-md:sr-only">{t("playing.share")}</span>
      </button>
      {onLeaderboard && (
        <button type="button" onClick={onLeaderboard} className={buttonClass("secondary", "sm", "max-md:px-2.5")}>
          <Trophy className="size-4 text-gold-500" aria-hidden="true" />
          <span className="max-md:sr-only">{t("playing.leaderboard")}</span>
        </button>
      )}
    </div>
  );
}
