import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarDays, Users } from "lucide-react";
import { Eyebrow, MiniGridThumb, TransitionLink } from "../../components/ui";
import { IMPORTER_CARD } from "../../components/PuzzleImporter/PuzzleImporter";
import { useTodaysDailies } from "../../hooks/useNextUp";
import { communityEnabled } from "../../lib/community";
import { track } from "../../lib/analytics";
import { withTvIntent } from "../../lib/tvHandoff";
import type { DailySlot } from "../../lib/dailyFeed";
import type { DailyMini } from "../../lib/dailyMinis";
import type { Puzzle } from "../../types/puzzle";

const SLOT_EYEBROW = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const satisfies Record<DailySlot, string>;
const SLOTS: DailySlot[] = ["mini", "midi", "large"];

/**
 * What the TV offers before "open a file" (Andrew, 2026-11-03: the chooser
 * still read like the days before the dailies, the archive and the community):
 * today's dailies as tiles that load straight into the TV, and the archive and
 * community pages with `?intent=tv`, where "Host on TV" hands the puzzle back
 * (`tvHandoff.ts`). A slot with nothing published shows no tile; the feed's
 * first answer of the day is awaited with a placeholder.
 */
export function TVPuzzleSources({ onPick }: { onPick: (puzzle: Puzzle) => void }) {
  const { t } = useTranslation();
  const dailies = useTodaysDailies();
  const tiles = SLOTS.map((slot) => ({ slot, daily: dailies[slot] })).filter((x): x is { slot: DailySlot; daily: DailyMini | undefined } => x.daily !== null);

  return (
    <div className="mb-8 grid grid-cols-[minmax(0,1fr)] gap-6">
      <section aria-labelledby="tv-dailies">
        <Eyebrow as="h2" id="tv-dailies" className="px-1">
          {t("importer.tvDailies")}
        </Eyebrow>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tiles.map(({ slot, daily }) =>
            daily === undefined ? (
              <div key={slot} className={`${IMPORTER_CARD} animate-pulse motion-reduce:animate-none`} aria-hidden="true">
                <span className="h-3.5 w-24 rounded bg-surface-sunken" />
                <span className="h-5 w-40 rounded bg-surface-sunken" />
                <span className="h-4 w-28 rounded bg-surface-sunken" />
              </div>
            ) : (
              <button
                key={slot}
                type="button"
                onClick={() => {
                  track("mode_selected", { mode: "tv-daily", slot });
                  onPick(daily.puzzle);
                }}
                className={`${IMPORTER_CARD} items-start`}
                aria-label={t("importer.hostOnTvLabel", { title: daily.puzzle.title })}
              >
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">{t(SLOT_EYEBROW[slot])}</span>
                <span className="flex w-full items-center gap-3">
                  <MiniGridThumb puzzle={daily.puzzle} className="w-14 shrink-0" />
                  <span className="block min-w-0">
                    <span className="block truncate font-display text-base font-semibold leading-snug text-ink">{daily.puzzle.title}</span>
                    <span className="mt-0.5 block truncate text-xs tabular-nums text-muted">
                      {t("menu.dailyMeta", { width: daily.puzzle.width, height: daily.puzzle.height, count: daily.puzzle.clues.length })}
                      {daily.theme ? ` · ${daily.theme}` : ""}
                    </span>
                  </span>
                </span>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                  {t("importer.hostOnTv")}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </button>
            ),
          )}
        </div>
      </section>

      <section aria-labelledby="tv-more">
        <Eyebrow as="h2" id="tv-more" className="px-1">
          {t("importer.tvMore")}
        </Eyebrow>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TransitionLink to={withTvIntent("/archive")} className={IMPORTER_CARD}>
            <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <CalendarDays className="size-5" aria-hidden="true" />
            </span>
            <span className="block">
              <span className="block font-display text-base font-semibold leading-snug text-ink">{t("importer.tvPast")}</span>
              <span className="mt-0.5 block text-sm text-muted">{t("importer.tvPastDesc")}</span>
            </span>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
              {t("importer.browse")}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </TransitionLink>
          {communityEnabled() && (
            <TransitionLink to={withTvIntent("/puzzles")} className={IMPORTER_CARD}>
              <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Users className="size-5" aria-hidden="true" />
              </span>
              <span className="block">
                <span className="block font-display text-base font-semibold leading-snug text-ink">{t("importer.tvCommunity")}</span>
                <span className="mt-0.5 block text-sm text-muted">{t("importer.tvCommunityDesc")}</span>
              </span>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                {t("importer.browse")}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </TransitionLink>
          )}
        </div>
      </section>
    </div>
  );
}
