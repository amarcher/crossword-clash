import { useTranslation } from "react-i18next";
import { Check, Newspaper, Tv, Users } from "lucide-react";
import { FlowPage } from "../Flow";
import { AdSlot } from "../AdSlot";
import { Button, Card, Eyebrow, ListGroup, ListRow, MiniGridThumb } from "../ui";
import type { Puzzle } from "../../types/puzzle";

interface PuzzleReadyProps {
  puzzle: Puzzle;
  onPlaySolo: () => void;
  onHostGame: () => void;
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
  onHostGame,
  onHostOnTV,
  showHostOptions,
  onBack,
  nytStreak = 0,
}: PuzzleReadyProps) {
  const { t } = useTranslation();
  const acrossCount = puzzle.clues.filter((c) => c.direction === "across").length;
  const downCount = puzzle.clues.filter((c) => c.direction === "down").length;
  const fromNyt = puzzle.origin === "nyt-bookmarklet";

  return (
    <FlowPage
      wide
      onBack={onBack}
      backLabel={t("common.back")}
      eyebrow={
        // First thing a bookmarklet import shows — confirm success explicitly
        // rather than silently landing on a puzzle summary.
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
          <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
          {fromNyt ? t("puzzleReady.importedFromNyt") : t("puzzleReady.importedBadge")}
        </span>
      }
      title={puzzle.title}
      subtitle={puzzle.author ? t("puzzleReady.by", { author: puzzle.author }) : undefined}
    >
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        <Card className="flex items-center gap-4 p-4 lg:flex-col lg:p-6">
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
        </Card>

        <div className="grid gap-5">
          <Button size="lg" block onClick={onPlaySolo}>
            {t("menu.playSolo")}
          </Button>

          {showHostOptions && (
            <section className="grid gap-3">
              <Eyebrow as="h2" className="px-1">{t("puzzleReady.friendsHeading")}</Eyebrow>
              <ListGroup>
                <ListRow
                  icon={Users}
                  title={t("menu.hostAsPlayer")}
                  subtitle={t("menu.hostAsPlayerSubtitle")}
                  onClick={onHostGame}
                />
                <ListRow
                  icon={Tv}
                  tone="neutral"
                  title={t("menu.hostAsTV")}
                  subtitle={t("menu.hostAsTVSubtitle")}
                  onClick={onHostOnTV}
                />
              </ListGroup>
            </section>
          )}
        </div>
      </div>
      <div className="mt-6 flex justify-center">
        <AdSlot placement="puzzle-ready-bottom" />
      </div>
    </FlowPage>
  );
}
