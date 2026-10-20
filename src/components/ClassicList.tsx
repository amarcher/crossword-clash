import { useTranslation } from "react-i18next";
import { Check, Swords } from "lucide-react";
import { Button } from "./ui";
import { sizeBucket, type ClassicEntry } from "../lib/classicLibrary";
import { formatDuration } from "../lib/soloStats";

interface ClassicListProps {
  entries: readonly ClassicEntry[];
  /** `puzzleIdentity()` → best time, for the solved badge. */
  bestTimes: Readonly<Record<string, number>>;
  /** The entry currently loading (its button shows "Loading…"; every button disables). */
  busy: string | null;
  /**
   * "library": the card is "Play solo" with a secondary "Race friends".
   * "pick": the card is one "Pick" action (the fresh-puzzle picker: the
   * caller decides what picking means — race, or the next puzzle of a room).
   */
  intent: "library" | "pick";
  onPrimary: (entry: ClassicEntry) => void;
  /** Library only: shown when present. */
  onRace?: (entry: ClassicEntry) => void;
  raceDisabled?: boolean;
}

/**
 * The classic library's card grid, shared by the library screen and the
 * fresh-puzzle picker so the cards (number, size, author, blurb, solved
 * badge) look the same wherever a classic is offered.
 */
export function ClassicList({ entries, bestTimes, busy, intent, onPrimary, onRace, raceDisabled }: ClassicListProps) {
  const { t } = useTranslation();
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => {
        const best = bestTimes[entry.identity];
        const isSolved = typeof best === "number";
        const isBusy = busy === entry.file;
        return (
          <li
            key={entry.file}
            className={`relative flex flex-col rounded-2xl border bg-surface p-4 shadow-card transition-[box-shadow,border-color] duration-150 hover:shadow-raised ${
              isSolved ? "border-brand-200" : "border-line hover:border-line-strong"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-xs font-semibold uppercase tracking-[0.06em] text-subtle tabular-nums">
                {t("classics.cardEyebrow", {
                  number: entry.number,
                  size: `${entry.width}×${entry.height}`,
                  clues: entry.clues,
                })}
                {" · "}
                {t(`classics.size.${sizeBucket(entry)}`)}
              </p>
              {isSolved && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 tabular-nums ring-1 ring-brand-100">
                  <Check className="size-3.5" aria-hidden="true" />
                  {formatDuration(best)}
                </span>
              )}
            </div>
            <h2 className="mt-1.5 font-display text-lg font-semibold leading-snug tracking-tight text-ink">
              {entry.title}
            </h2>
            <p className="text-sm text-muted">{t("classics.by", { author: entry.author })}</p>
            {entry.blurb && (
              <p className="mt-2 line-clamp-3 text-sm italic leading-snug text-ink-soft">“{entry.blurb}”</p>
            )}
            <div className="mt-auto flex gap-2 pt-4">
              {/* The primary button's ::after stretches over the whole card, so the card itself is the target. */}
              <Button
                variant={isSolved && intent === "library" ? "secondary" : "soft"}
                onClick={() => onPrimary(entry)}
                disabled={busy !== null}
                className="flex-1 after:absolute after:inset-0 after:rounded-2xl"
              >
                {isBusy
                  ? t("classics.loadingPuzzle")
                  : intent === "pick"
                    ? t("picker.pick")
                    : isSolved
                      ? t("classics.playAgain")
                      : t("classics.playSolo")}
              </Button>
              {intent === "library" && onRace && (
                <Button
                  variant="ghost"
                  onClick={() => onRace(entry)}
                  disabled={busy !== null || raceDisabled}
                  className="relative z-10"
                >
                  <Swords className="size-4" aria-hidden="true" />
                  {t("classics.raceFriends")}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
