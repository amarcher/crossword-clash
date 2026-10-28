import { useTranslation } from "react-i18next";
import { Check, Swords } from "lucide-react";
import { Button, TransitionLink } from "./ui";
import { authorPath, puzzlePath, sizeBucketOf, type CommunityPuzzle } from "../lib/communityPuzzles";
import { formatDuration } from "../lib/soloStats";

interface CommunityListProps {
  entries: readonly CommunityPuzzle[];
  /** `puzzleIdentity()` → best time, for the solved chip. */
  bestTimes: Readonly<Record<string, number>>;
  /** Identities with a solo game under way on this device. */
  inProgress: ReadonlySet<string>;
  /** The entry currently loading (its button shows "Loading…"; every button disables). */
  busy: string | null;
  onPlay: (entry: CommunityPuzzle) => void;
  onRace?: (entry: CommunityPuzzle) => void;
  raceDisabled?: boolean;
  /** On an author's own page the credit line is redundant. */
  showAuthor?: boolean;
}

/**
 * The community library's card grid (docs/community-puzzles-spec.md §2.1):
 * one card per puzzle with its facts — size · clues ·
 * difficulty, the solved chip with the best time, the title (a link to the
 * puzzle's page), the author (a link to theirs), the note, plays and solves,
 * and Play solo + Race friends.
 */
export function CommunityList({ entries, bestTimes, inProgress, busy, onPlay, onRace, raceDisabled, showAuthor = true }: CommunityListProps) {
  const { t } = useTranslation();
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => {
        const best = bestTimes[entry.puzzle_key];
        const isSolved = typeof best === "number";
        const resumable = !isSolved && inProgress.has(entry.puzzle_key);
        const isBusy = busy === entry.short_id;
        return (
          <li
            key={entry.id}
            className={`flex flex-col rounded-2xl border bg-surface p-4 shadow-card transition-[box-shadow,border-color] duration-150 hover:shadow-raised ${
              isSolved ? "border-brand-200" : "border-line hover:border-line-strong"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-xs font-semibold uppercase tracking-[0.06em] text-subtle tabular-nums">
                {t("community.cardEyebrow", {
                  size: `${entry.width}×${entry.height}`,
                  clues: entry.clue_count,
                  difficulty: t(`community.difficulty.${entry.difficulty}`),
                })}
                <span className="sr-only"> · {t(`community.size.${sizeBucketOf(entry.width, entry.height)}`)}</span>
              </p>
              {isSolved ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 tabular-nums ring-1 ring-brand-100">
                  <Check className="size-3.5" aria-hidden="true" />
                  {formatDuration(best)}
                </span>
              ) : resumable ? (
                <span className="inline-flex shrink-0 items-center rounded-full bg-gold-50 px-2 py-0.5 text-xs font-semibold text-gold-700 ring-1 ring-gold-100">{t("community.inProgress")}</span>
              ) : null}
            </div>
            <h2 className="mt-1.5 font-display text-lg font-semibold leading-snug tracking-tight text-ink">
              <TransitionLink to={puzzlePath(entry.short_id)} className="rounded-md hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">
                {entry.title}
              </TransitionLink>
            </h2>
            {showAuthor && (
              <p className="text-sm text-muted">
                <TransitionLink to={authorPath(entry.author)} className="rounded-md hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">
                  {t("community.by", { author: entry.author })}
                </TransitionLink>
              </p>
            )}
            {entry.notes && <p className="mt-2 line-clamp-3 text-sm leading-snug text-ink-soft">{entry.notes}</p>}
            <p className="mt-2 text-xs text-subtle tabular-nums">{t("community.stats", { plays: entry.plays, solves: entry.solves })}</p>
            <div className="mt-auto flex gap-2 pt-4">
              <Button variant={isSolved ? "secondary" : "soft"} onClick={() => onPlay(entry)} disabled={busy !== null} className="flex-1">
                {isBusy ? t("community.loadingPuzzle") : isSolved ? t("community.playAgain") : resumable ? t("community.resume") : t("community.playSolo")}
              </Button>
              {onRace && (
                <Button variant="ghost" onClick={() => onRace(entry)} disabled={busy !== null || raceDisabled}>
                  <Swords className="size-4" aria-hidden="true" />
                  {t("community.raceFriends")}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
