import { useTranslation } from "react-i18next";
import { CalendarDays, Check, Newspaper, Trophy, Tv } from "lucide-react";
import { FlowPage } from "../Flow";
import { AdSlot } from "../AdSlot";
import { Button, Card, ListGroup, ListRow, MiniGridThumb, TransitionLink } from "../ui";
import type { Puzzle } from "../../types/puzzle";
import { formatShareDay } from "../../lib/shareBlock";
import { leaderboardPath, todayKey } from "../../lib/dailyLeaderboard";

const SLOT_LABEL = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const;

interface PuzzleReadyProps {
  puzzle: Puzzle;
  onPlaySolo: () => void;
  onHostOnTV: () => void;
  /** When false, only show Play Solo (e.g. no Supabase connection) */
  showHostOptions: boolean;
  /** Optional back affordance (returns to the menu). */
  onBack?: () => void;
  /** Kept for API compatibility; the light theme is used everywhere now. */
  darkMode?: boolean;
  /**
   * Current NYT-bookmarklet streak in days. Only shown for a puzzle whose
   * origin is the bookmarklet; 0 hides the streak line.
   */
  nytStreak?: number;
}

export function PuzzleReady({
  puzzle,
  onPlaySolo,
  onHostOnTV,
  showHostOptions,
  onBack,
  nytStreak = 0,
}: PuzzleReadyProps) {
  const { t, i18n } = useTranslation();
  // A daily opened by its link is ours, not an import: say which daily it is.
  const daily = puzzle.ref && "day" in puzzle.ref ? puzzle.ref : null;
  const acrossCount = puzzle.clues.filter((c) => c.direction === "across").length;
  const downCount = puzzle.clues.filter((c) => c.direction === "down").length;
  const fromNyt = puzzle.origin === "nyt-bookmarklet";

  return (
    <FlowPage
      wide
      onBack={onBack}
      backLabel={t("completion.backToMenu")}
      eyebrow={
        // First thing a bookmarklet import shows — confirm success explicitly
        // rather than silently landing on a puzzle summary.
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
          {daily ? <CalendarDays className="size-3.5" aria-hidden="true" /> : <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />}
          {daily
            ? t("puzzleReady.dailyBadge", { slot: t(SLOT_LABEL[daily.slot]), date: formatShareDay(daily.day, i18n.language) })
            : fromNyt
              ? t("puzzleReady.importedFromNyt")
              : t("puzzleReady.importedBadge")}
        </span>
      }
      title={puzzle.title}
      subtitle={puzzle.author ? t("puzzleReady.by", { author: puzzle.author }) : undefined}
    >
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 p-4 lg:flex-col lg:p-6">
          <MiniGridThumb puzzle={puzzle} className="w-24 shrink-0 lg:w-56" />
          <div className="min-w-0 lg:text-center">
            <p className="text-sm text-muted tabular-nums">
              {t("puzzleReady.dimensions", { width: puzzle.width, height: puzzle.height, acrossCount, downCount })}
            </p>
            {puzzle.source?.provider === "nyt" && <p className="mt-2 text-sm text-muted">{t("nytImport.sharing")}</p>}
            {/* The bookmarklet's return loop starts here: the first import is the
                moment to say "this works every day", before they've even played. */}
            {fromNyt && (
              <p className="mt-3 flex items-start gap-2 text-sm leading-snug text-muted lg:justify-center">
                <Newspaper className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden="true" />
                <span>
                  {t("puzzleReady.nytTomorrow")}
                  {nytStreak > 0 && (
                    <>
                      {" "}
                      <span className="font-semibold text-gold-700">{t("puzzleReady.nytStreak", { count: nytStreak })}</span>
                    </>
                  )}
                </span>
              </p>
            )}
          </div>
          </div>
          {/* A daily's board, in the strip the home cards use. */}
          {daily && (
            <div className="relative flex items-center border-t border-line bg-surface-sunken/60 px-5 py-2.5 hover:bg-surface-sunken sm:px-6">
              <TransitionLink
                to={leaderboardPath(daily.slot, daily.day === todayKey() ? null : daily.day)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-ink-soft after:absolute after:inset-0 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <Trophy className="size-4 text-gold-500" aria-hidden="true" />
                {t("menu.dailyLeaderboard")}
              </TransitionLink>
            </div>
          )}
        </Card>

        <div className="grid gap-5">
          <Button size="lg" block onClick={onPlaySolo}>
            {t("menu.playSolo")}
          </Button>

          {/* One Play button: racing friends is asked after it (SoloStartGate). A TV has no Play, so it keeps its row. */}
          {showHostOptions && (
            <ListGroup className="max-md:hidden">
              <ListRow icon={Tv} tone="neutral" title={t("menu.hostAsTV")} onClick={onHostOnTV} />
            </ListGroup>
          )}
        </div>
      </div>
      <div className="mt-6 flex justify-center">
        <AdSlot placement="puzzle-ready-bottom" />
      </div>
    </FlowPage>
  );
}
