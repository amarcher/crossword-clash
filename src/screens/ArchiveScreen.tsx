import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ChevronRight, BookOpen, Clock, Play, Swords } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { Button, Eyebrow, ListGroup, ListRow } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useGame, loadSavedSession } from "../contexts/GameContext";
import { useBestTimes } from "../hooks/useSolveHistory";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { track } from "../lib/analytics";
import { fetchDailyForDay, type DailySlot } from "../lib/dailyFeed";
import { knownPublishedIndex, loadPublishedIndex, type DailyIndexEntry } from "../lib/dailyIndex";
import { knownClassicManifest, loadClassicManifest, type ClassicEntry } from "../lib/classicLibrary";
import { prefetchOnIntent } from "../routeModules";
import { dayKey, formatDuration, loadSoloTimer } from "../lib/soloStats";
import {
  archiveCounts,
  defaultSelection,
  deriveArchiveItems,
  groupByDay,
  longDay,
  monthCells,
  monthLabel,
  monthOf,
  resumableIdentity,
  resumableItem,
  shiftMonth,
  shortDay,
  toDate,
  weekdayInitials,
  type ArchiveItem,
  type ArchiveStatus,
} from "../lib/archive";

const SLOT_EYEBROW = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const satisfies Record<DailySlot, string>;

/** Status dots in a day cell: filled brand = solved, gold = in progress, hollow = unsolved. */
const DOT: Record<ArchiveStatus, string> = {
  solved: "bg-brand-600",
  inprogress: "bg-gold-500",
  unsolved: "bg-surface ring-1 ring-inset ring-line-strong",
};
const DOT_ON_SELECTED: Record<ArchiveStatus, string> = {
  solved: "bg-white",
  inprogress: "bg-gold-400",
  unsolved: "ring-1 ring-inset ring-white/70",
};

/** MiniGridThumb's look, drawn from the index's block string so no puzzle is fetched to show a shape. */
function ShapeThumb({ blocks, className = "" }: { blocks: string; className?: string }) {
  const rows = blocks.split("/");
  const width = rows[0]?.length || 1;
  const last = rows.length - 1;
  return (
    <div
      aria-hidden="true"
      className={`grid gap-px rounded-md bg-ink p-px ${className}`}
      style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`, aspectRatio: `${width} / ${rows.length}` }}
    >
      {rows.flatMap((row, r) =>
        [...row].map((ch, c) => (
          <div
            key={`${r}-${c}`}
            className={`${ch === "#" ? "bg-ink" : "bg-surface"} ${r === 0 && c === 0 ? "rounded-tl-[5px]" : ""} ${r === 0 && c === width - 1 ? "rounded-tr-[5px]" : ""} ${r === last && c === 0 ? "rounded-bl-[5px]" : ""} ${r === last && c === width - 1 ? "rounded-br-[5px]" : ""}`}
          />
        )),
      )}
    </div>
  );
}

/** Solved → brand chip with the time; in progress → gold chip; unsolved → nothing. Icon + text, never colour alone. */
function StatusChip({ item }: { item: Pick<ArchiveItem, "status" | "seconds"> }) {
  const { t } = useTranslation();
  if (item.status === "solved") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 tabular-nums ring-1 ring-brand-100">
        <Check className="size-3.5" aria-hidden="true" />
        {item.seconds !== null ? formatDuration(item.seconds) : t("archive.solved")}
      </span>
    );
  }
  if (item.status === "inprogress") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold-50 px-2 py-0.5 text-xs font-semibold text-gold-700 ring-1 ring-gold-100">
        <Clock className="size-3.5" aria-hidden="true" />
        {t("archive.inProgress")}
      </span>
    );
  }
  return null;
}

/**
 * /archive — every published daily (mini, midi, large) since the feed began,
 * as a month calendar with the viewer's own status on each day, and the
 * selected day's puzzles beneath it with Play / Race. Status is derived on
 * the client from the generated index (`identity`) and the viewer's best
 * times (local stats, or the account's solves), plus the one solo game the
 * device would resume. Future days are filtered out here; the index files
 * carry them. Play and Race reuse the daily paths exactly: `fetchDailyForDay`
 * → `handleSoloPuzzleLoaded` → /solo/play, or `setUrlPuzzle` → /host-game/name.
 * Spec: docs/puzzle-archive-spec.md.
 */
export function ArchiveScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const navigate = useTransitionNavigate();
  const { user, loading: authLoading } = useAuth();
  const { handleSoloPuzzleLoaded, setSoloTheme, setUrlPuzzle } = useGame();
  const today = dayKey(new Date());

  // The route's lazy() warmed the index, so this is normally known on the first render.
  const [entries, setEntries] = useState<DailyIndexEntry[] | null | undefined>(() => knownPublishedIndex(today) ?? undefined);
  const [classics, setClassics] = useState<ClassicEntry[] | null>(() => knownClassicManifest());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (entries === undefined) void loadPublishedIndex(today).then((list) => alive && setEntries(list));
    if (classics === null) void loadClassicManifest().then((list) => alive && setClassics(list));
    return () => {
      alive = false;
    };
  }, [entries, classics, today]);

  const bestTimes = useBestTimes();
  // The resumable solo game is read once: this screen is never prerendered, and
  // playing from here navigates away before it could change.
  const [inProgress] = useState(() => resumableIdentity(loadSavedSession(), loadSoloTimer()));
  const items = useMemo(() => deriveArchiveItems(entries ?? [], bestTimes, inProgress), [entries, bestTimes, inProgress]);
  const byDay = useMemo(() => groupByDay(items), [items]);
  const counts = useMemo(() => archiveCounts(items), [items]);
  const resume = useMemo(() => resumableItem(items), [items]);
  const classicsSolved = useMemo(() => (classics ?? []).filter((c) => c.identity in bestTimes).length, [classics, bestTimes]);

  // Calendar state: the month shown and the day whose puzzles are listed.
  const [selected, setSelected] = useState<{ day: string; month: string } | null>(null);
  const opening = selected ?? defaultSelection(items, today);
  const month = opening?.month ?? monthOf(today);
  const selectedDay = opening?.day ?? null;
  const firstMonth = items.length > 0 ? monthOf(items[0].day) : month;
  const canPrev = month > firstMonth;
  const canNext = month < monthOf(today);
  const cells = useMemo(() => monthCells(month), [month]);
  const weekdays = useMemo(() => weekdayInitials(locale), [locale]);
  const inMonth = items.filter((i) => i.day.startsWith(month));
  const monthSolved = inMonth.filter((i) => i.status === "solved").length;

  const panelRef = useRef<HTMLElement>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const pick = useCallback((day: string) => {
    setSelected({ day, month: monthOf(day) });
    // The day's puzzles sit under the grid on a phone; bring them into view
    // (a plain jump under reduced motion).
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => {
      const el = panelRef.current;
      if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    });
  }, []);
  const showMonth = (next: string) => setSelected({ day: selectedDay ?? today, month: next });

  // Arrow keys move focus between days of the month (roving tabindex); Enter/Space pick.
  const onGridKey = (e: React.KeyboardEvent<HTMLButtonElement>, day: string) => {
    const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -7 : e.key === "ArrowDown" ? 7 : 0;
    if (!delta) return;
    const d = toDate(day);
    d.setDate(d.getDate() + delta);
    const target = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const el = cellRefs.current.get(target);
    if (el) {
      e.preventDefault();
      el.focus();
    }
  };

  const load = useCallback(
    async (item: ArchiveItem) => {
      setError(null);
      setBusy(item.identity);
      const daily = await fetchDailyForDay(item.day, item.slot);
      if (!daily) {
        setError(t("archive.loadError"));
        setBusy(null);
      }
      return daily;
    },
    [t],
  );
  const play = useCallback(
    async (item: ArchiveItem) => {
      const daily = await load(item);
      if (!daily) return;
      track("mode_selected", { mode: "archive", slot: item.slot, status: item.status });
      // The daily path: straight into solo play, no import step.
      await handleSoloPuzzleLoaded(daily.puzzle);
      setSoloTheme(daily.theme || null);
      navigate("/solo/play");
    },
    [load, handleSoloPuzzleLoaded, setSoloTheme, navigate],
  );
  const race = useCallback(
    async (item: ArchiveItem) => {
      const daily = await load(item);
      if (!daily) return;
      track("mode_selected", { mode: "archive-race", slot: item.slot });
      // The daily race path: HostNameScreen consumes urlPuzzle and creates the room.
      setUrlPuzzle(daily.puzzle);
      navigate("/host-game/name");
    },
    [load, setUrlPuzzle, navigate],
  );

  const canRace = Boolean(user) || authLoading;
  const dayItems = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const navButton =
    "grid size-11 shrink-0 place-items-center rounded-xl text-ink-soft hover:bg-surface-sunken active:bg-line disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-brand-500";

  const statusText = (it: ArchiveItem) =>
    it.status === "solved"
      ? it.seconds !== null
        ? t("archive.solvedIn", { time: formatDuration(it.seconds) })
        : t("archive.solved").toLowerCase()
      : it.status === "inprogress"
        ? t("archive.inProgress").toLowerCase()
        : t("archive.unsolved").toLowerCase();

  return (
    <PageShell width="md" widthLg="4xl" bar={{ backLabel: t("completion.backToMenu") }}>
      <div className="pb-10 pt-3">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t("archive.title")}</h1>
        <p className="mt-1 min-h-5 text-sm text-muted tabular-nums" aria-live="polite">
          {entries && counts.total > 0
            ? t(counts.left === 0 ? "archive.subtitleAllSolved" : "archive.subtitle", { ...counts })
            : entries === null
              ? ""
              : " "}
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        {entries === null ? (
          <p className="py-16 text-center text-sm text-muted">{t("archive.unavailable")}</p>
        ) : entries && entries.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">{t("archive.empty")}</p>
        ) : (
          <>
            {resume && (
              <section className="mt-4 flex items-center gap-3 rounded-2xl bg-gold-50 p-3 ring-1 ring-gold-100" aria-label={t("archive.resumeEyebrow")}>
                <ShapeThumb blocks={resume.blocks} className="w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold-700">{t("archive.resumeEyebrow")}</p>
                  <p className="truncate font-semibold leading-snug text-ink">{resume.title}</p>
                  <p className="truncate text-xs text-muted">
                    {t(SLOT_EYEBROW[resume.slot])} · {shortDay(resume.day, locale)}
                  </p>
                </div>
                <Button size="sm" onClick={() => void play(resume)} disabled={busy !== null} {...prefetchOnIntent("/solo/play")}>
                  <Play className="size-4" aria-hidden="true" />
                  {t("archive.resume")}
                </Button>
              </section>
            )}

            <div className="lg:mt-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
              <div>
                <div className="mt-4 flex items-center justify-between gap-2 lg:mt-0">
                  <button type="button" onClick={() => showMonth(shiftMonth(month, -1))} disabled={!canPrev} aria-label={t("archive.prevMonth")} className={navButton}>
                    <ChevronLeft className="size-5" aria-hidden="true" />
                  </button>
                  <div className="min-w-0 text-center" aria-live="polite">
                    <h2 className="truncate font-display text-xl font-bold tracking-tight text-ink">{monthLabel(month, locale)}</h2>
                    <p className="text-xs text-muted tabular-nums" aria-busy={entries === undefined}>
                      {entries === undefined ? " " : t("archive.monthProgress", { solved: monthSolved, total: inMonth.length })}
                    </p>
                  </div>
                  <button type="button" onClick={() => showMonth(shiftMonth(month, 1))} disabled={!canNext} aria-label={t("archive.nextMonth")} className={navButton}>
                    <ChevronRight className="size-5" aria-hidden="true" />
                  </button>
                </div>

                <div role="grid" aria-label={monthLabel(month, locale)} aria-busy={entries === undefined} className="mt-3 rounded-2xl border border-line bg-surface p-2 shadow-card">
                  <div role="row" className="grid grid-cols-7">
                    {weekdays.map((w, i) => (
                      <div key={i} role="columnheader" className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-subtle">
                        {w}
                      </div>
                    ))}
                  </div>
                  {Array.from({ length: cells.length / 7 }, (_, week) => (
                    <div key={week} role="row" className="grid grid-cols-7 gap-y-1">
                      {cells.slice(week * 7, week * 7 + 7).map((day, i) => {
                        if (!day) return <div key={`pad-${i}`} role="gridcell" aria-hidden="true" />;
                        const list = byDay.get(day) ?? [];
                        const future = day > today;
                        const empty = list.length === 0;
                        const isSelected = day === selectedDay;
                        const isToday = day === today;
                        const label = `${longDay(day, locale)}: ${
                          empty
                            ? future
                              ? t("archive.dayNotYet")
                              : t("archive.dayNoPuzzles")
                            : list.map((it) => `${t(SLOT_EYEBROW[it.slot])} ${statusText(it)}`).join(", ")
                        }`;
                        return (
                          <div key={day} role="gridcell" className="flex justify-center">
                            <button
                              type="button"
                              ref={(el) => {
                                if (el) cellRefs.current.set(day, el);
                                else cellRefs.current.delete(day);
                              }}
                              disabled={empty}
                              tabIndex={isSelected ? 0 : -1}
                              aria-label={label}
                              aria-pressed={isSelected}
                              aria-current={isToday ? "date" : undefined}
                              onClick={() => pick(day)}
                              onKeyDown={(e) => onGridKey(e, day)}
                              className={`flex h-12 w-full max-w-12 flex-col items-center justify-center gap-1 rounded-xl text-sm font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
                                isSelected ? "bg-brand-600 text-white" : empty ? "text-subtle/60" : "text-ink hover:bg-surface-sunken active:bg-line"
                              } ${isToday && !isSelected ? "ring-1 ring-inset ring-brand-500" : ""}`}
                            >
                              <span>{toDate(day).getDate()}</span>
                              <span className="flex h-1.5 gap-1" aria-hidden="true">
                                {list.map((it) => (
                                  <span key={it.slot} className={`size-1.5 rounded-full ${isSelected ? DOT_ON_SELECTED[it.status] : DOT[it.status]}`} />
                                ))}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted" aria-label={t("archive.legend")}>
                  <li className="inline-flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${DOT.solved}`} aria-hidden="true" /> {t("archive.solved")}
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${DOT.inprogress}`} aria-hidden="true" /> {t("archive.inProgress")}
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${DOT.unsolved}`} aria-hidden="true" /> {t("archive.unsolved")}
                  </li>
                </ul>
              </div>

              <section ref={panelRef} aria-live="polite" className="mt-5 scroll-mt-4 lg:mt-0">
                <h2 className="font-display text-lg font-bold tracking-tight text-ink">
                  {selectedDay ? longDay(selectedDay, locale) : " "}
                  {selectedDay === today && <span className="ml-2 text-sm font-semibold text-brand-600">{t("archive.today")}</span>}
                </h2>
                {entries === undefined ? (
                  <ul className="mt-2 space-y-2.5" aria-busy="true">
                    {[0, 1, 2].map((i) => (
                      <li key={i} className="h-[88px] animate-pulse rounded-2xl border border-line bg-surface" />
                    ))}
                  </ul>
                ) : dayItems.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">{t("archive.nothingThatDay")}</p>
                ) : (
                  <ul className="mt-2 space-y-2.5">
                    {dayItems.map((it) => {
                      const primary = it.status === "unsolved" || it.status === "inprogress";
                      return (
                        <li key={it.slot} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card">
                          <ShapeThumb blocks={it.blocks} className="w-14 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex min-h-5 items-center gap-2">
                              <Eyebrow className="shrink-0 text-brand-600">{t(SLOT_EYEBROW[it.slot])}</Eyebrow>
                              <StatusChip item={it} />
                            </div>
                            <p className="mt-0.5 truncate font-display text-base font-semibold leading-snug text-ink">{it.title}</p>
                            <p className="truncate text-xs text-muted tabular-nums">
                              {t("menu.dailyMeta", { width: it.width, height: it.height, count: it.clues })}
                              {it.theme ? ` · ${it.theme}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1.5">
                            <Button
                              size="sm"
                              variant={primary ? "primary" : "secondary"}
                              onClick={() => void play(it)}
                              disabled={busy !== null}
                              {...prefetchOnIntent("/solo/play")}
                            >
                              {busy === it.identity
                                ? t("classics.loadingPuzzle")
                                : it.status === "solved"
                                  ? t("archive.playAgain")
                                  : it.status === "inprogress"
                                    ? t("archive.resume")
                                    : t("archive.play")}
                            </Button>
                            {canRace && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void race(it)}
                                disabled={busy !== null || authLoading}
                                aria-label={t("archive.raceLabel", { title: it.title })}
                                {...prefetchOnIntent("/host-game/name")}
                              >
                                <Swords className="size-4" aria-hidden="true" />
                                {t("archive.race")}
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}

        <ListGroup className="mt-8">
          <ListRow
            icon={BookOpen}
            tone="gold"
            to="/classics"
            title={t("menu.classicLibrary")}
            subtitle={classics && classics.length > 0 ? t("archive.classicsSubtitle", { solved: classicsSolved, total: classics.length }) : t("menu.classicLibrarySubtitle")}
            onClick={() => track("mode_selected", { mode: "classics", from: "archive" })}
          />
        </ListGroup>
      </div>
    </PageShell>
  );
}
