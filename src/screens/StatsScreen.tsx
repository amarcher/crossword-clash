import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { PlusSeal } from "../components/ui/PlusBadge";
import { PageShell } from "../components/PageShell";
import { Button, Card, Eyebrow } from "../components/ui";
import { useMaybeAccount } from "../contexts/AccountContext";
import { useSolveHistory } from "../hooks/useSolveHistory";
import { countsForDailyStreak } from "../lib/solveHistory";
import { REPAIR_KEY_PREFIX } from "../lib/streakRepair";
import { averageByWeekday, calendarWeeks, fetchStats, lastDays, rankedCount, summarizeSlot, type DailyResult, type StatsData } from "../lib/stats";
import { dayKey, formatDuration, shiftDayKey } from "../lib/soloStats";
import { DAILY_SLOTS, type DailySlot } from "../lib/dailyFeed";

const SLOT_LABEL = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const;

/** A free player's chart covers this many days; Plus has the year. */
const FREE_CHART_DAYS = 30;

/**
 * What stands in for a Plus figure on a free player's page: a lock, a true
 * line about what is behind it, and the way in. Never an invented or blurred figure.
 */
function Locked({ children, cta, onUnlock }: { children: React.ReactNode; cta: string; onUnlock: () => void }) {
  return (
    <button
      type="button"
      onClick={onUnlock}
      className="mt-3 flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl bg-gold-50 px-3 py-2 text-left text-sm text-ink ring-1 ring-gold-100 hover:bg-gold-100 focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <Lock className="size-4 shrink-0 text-gold-700" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-balance">{children}</span>
      <span className="shrink-0 font-semibold text-gold-700">{cta}</span>
    </button>
  );
}

/**
 * `/stats` (docs/plus-expansion-spec.md §3). Every figure on the page is the
 * player's own and real (Andrew, 2026-11-13: the free page drew invented,
 * blurred numbers and looked fake). A free player sees what they did: average,
 * best, solved, the last 30 days of times and the solved-days calendar. Plus
 * adds how they compare and where they struggle: the full year with each day's
 * time, the share of solvers beaten, weekdays, head-to-head records and the
 * slowest clues. Each of those shows a free player a lock and a true line
 * about what is behind it (`Locked`), from counts the server sends.
 */
export function StatsScreen() {
  const { t, i18n } = useTranslation();
  const account = useMaybeAccount();
  const history = useSolveHistory();
  const today = dayKey(new Date());
  const plus = !!account?.plus;
  // Without accounts in this build there is no Plus to check: the page shows its free state.
  const known = (!!account?.ready && !!account?.plusReady) || account?.available === false || !account;
  const [data, setData] = useState<StatsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [slot, setSlot] = useState<DailySlot>("mini");

  useEffect(() => {
    if (!known) return;
    let live = true;
    fetchStats(shiftDayKey(today, -365), plus).then(
      (d) => live && setData(d),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [known, plus, today]);

  const locked = known && !plus;
  const unlockLabel = t("stats.unlock");
  const unlock = () => account?.openPaywall({ placement: "stats", feature: "stats", returnTo: "/stats" });
  const slotResults = useMemo(() => (data ? data.results.filter((r) => r.slot === slot) : []), [data, slot]);
  const charted = useMemo(() => (locked ? lastDays(slotResults, today, FREE_CHART_DAYS) : slotResults), [locked, slotResults, today]);
  const summary = summarizeSlot(slotResults);
  const ranked = rankedCount(slotResults);
  const weekdays = averageByWeekday(slotResults);
  const weekdayNames = useMemo(() => {
    const f = new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" });
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2026, 10, 9 + i))));
  }, [i18n.language]);

  const calendar = useMemo(() => {
    if (!history.rows) return null;
    const solved = new Set(history.rows.filter((r) => countsForDailyStreak(r) && !r.puzzle_key.startsWith(REPAIR_KEY_PREFIX)).map((r) => r.completed_day));
    const repaired = new Set(history.rows.filter((r) => r.puzzle_key.startsWith(REPAIR_KEY_PREFIX)).map((r) => r.completed_day));
    return calendarWeeks(solved, repaired, today);
  }, [history.rows, today]);

  return (
    <PageShell width="md" widthLg="4xl" bar={{ backLabel: t("completion.backToMenu") }}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pb-10 pt-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t("stats.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("stats.subtitle")}</p>
        </div>

        <div role="radiogroup" aria-label={t("stats.slot")} className="grid grid-cols-3 gap-1 rounded-xl bg-surface-sunken p-1 sm:w-80">
          {DAILY_SLOTS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={slot === s}
              onClick={() => setSlot(s)}
              className={`min-h-10 cursor-pointer rounded-lg px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${slot === s ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}
            >
              {t(SLOT_LABEL[s])}
            </button>
          ))}
        </div>

        {failed && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
            {t("stats.loadFailed")}
          </p>
        )}

        <Card className="p-5">
          {/* A free player's tiles are the three figures they have; what Plus adds sits under them as one locked row, like the sections below (Andrew, 2026-11-13: a lock inside a tile read badly). */}
          <dl className={`grid gap-4 ${locked ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
            <Stat label={t("stats.average")} value={summary.average === null ? "–" : formatDuration(summary.average)} />
            <Stat label={t("stats.best")} value={summary.best ? formatDuration(summary.best.seconds) : "–"} />
            {!locked && <Stat label={t("stats.fasterThan")} value={summary.fasterThan === null ? "–" : `${Math.round(summary.fasterThan * 100)}%`} />}
            <Stat label={t("stats.solved")} value={String(summary.count)} />
          </dl>
          {locked && data && (
            <Locked cta={unlockLabel} onUnlock={unlock}>
              {ranked > 0 ? t("stats.fasterTeaser", { count: ranked }) : t("stats.fasterTeaserNone")}
            </Locked>
          )}
          {locked && (
            <Button className="mt-3" block onClick={unlock}>
              <PlusSeal size="1rem" />
              {t("stats.seeWithPlus")}
            </Button>
          )}
        </Card>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <Eyebrow as="h2">{t("stats.overTime")}</Eyebrow>
            {charted.length > 0 ? (
              <TimesChart results={charted} average={summary.average} detail={!locked} locale={i18n.language} label={t("stats.overTime")} />
            ) : (
              <p className="mt-3 text-sm text-muted">{data ? t("stats.notEnough") : t("stats.loading")}</p>
            )}
            {locked && data && (
              <Locked cta={unlockLabel} onUnlock={unlock}>
                {t("stats.fullYearTeaser", { days: FREE_CHART_DAYS })}
              </Locked>
            )}
          </Card>

          <Card className="p-5">
            <Eyebrow as="h2">{t("stats.byWeekday")}</Eyebrow>
            {locked ? (
              <Locked cta={unlockLabel} onUnlock={unlock}>
                {t("stats.weekdayTeaser")}
              </Locked>
            ) : (
              <WeekdayChart averages={weekdays} names={weekdayNames} label={t("stats.byWeekday")} />
            )}
          </Card>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <Eyebrow as="h2">{t("stats.headToHead")}</Eyebrow>
            {data && data.headToHead.length > 0 ? (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
                    <th scope="col" className="pb-2">{t("stats.friend")}</th>
                    <th scope="col" className="pb-2 text-right">{locked ? t("stats.inCommon") : t("stats.record")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.headToHead.map((h) => (
                    <tr key={h.friendId}>
                      <td className="py-2 font-semibold text-ink">@{h.username}</td>
                      <td className="py-2 text-right tabular-nums text-ink-soft">
                        {h.wins === null ? t("stats.dailiesInCommon", { count: h.played }) : t("stats.recordLine", { wins: h.wins, losses: h.losses, ties: h.ties })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-3 text-sm text-muted">{data ? t("stats.noFriends") : t("stats.loading")}</p>
            )}
            {locked && data && data.headToHead.length > 0 && (
              <Locked cta={unlockLabel} onUnlock={unlock}>
                {t("stats.headToHeadTeaser")}
              </Locked>
            )}
          </Card>

          <Card className="p-5">
            <Eyebrow as="h2">{t("stats.slowClues")}</Eyebrow>
            {locked && data && (data.slowClueCount ?? 0) > 0 ? (
              <Locked cta={unlockLabel} onUnlock={unlock}>
                {t("stats.slowCluesTeaser", { count: data.slowClueCount ?? 0 })}
              </Locked>
            ) : data && data.slowClues.length > 0 ? (
              <ol className="mt-3 grid gap-2 text-sm">
                {data.slowClues.map((c, i) => (
                  <li key={`${c.puzzleTitle}-${c.clue}-${i}`} className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate text-ink">
                      <span className="font-semibold">{c.clue}</span> · {c.puzzleTitle}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-soft">{formatDuration(c.seconds)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted">{data ? t("stats.noClues") : t("stats.loading")}</p>
            )}
          </Card>
        </div>

        {calendar && (
          <Card className="p-5">
            <Eyebrow as="h2">{t("stats.calendar")}</Eyebrow>
            <Calendar weeks={calendar} label={t("stats.calendar")} />
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-[3px] bg-brand-500" aria-hidden="true" />
                {t("stats.legendSolved")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-[3px] bg-gold-400" aria-hidden="true" />
                {t("stats.legendRepaired")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-[3px] bg-surface-sunken ring-1 ring-line" aria-hidden="true" />
                {t("stats.legendNone")}
              </span>
            </p>
          </Card>
        )}
      </div>
    </PageShell>
  );
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-muted">{note}</dd>}
    </div>
  );
}

const W = 320;
const H = 150;
const PAD = { l: 40, r: 8, t: 10, b: 22 };

/** Your times in a slot, one point per day; with `detail` (Plus) the average as a dashed rule and each day's time on hover. */
function TimesChart({ results, average, detail, locale, label }: { results: DailyResult[]; average: number | null; detail: boolean; locale: string; label: string }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...results.map((r) => r.seconds), (detail ? average : null) ?? 0) * 1.1;
  // One bar per day played, in order: a day without a solve takes no room, so the bars never imply a trend across a gap.
  const slot = (W - PAD.l - PAD.r) / results.length;
  const barW = Math.max(1.5, Math.min(22, slot * 0.7));
  const cx = (i: number) => PAD.l + slot * i + slot / 2;
  const y = (s: number) => PAD.t + (1 - s / max) * (H - PAD.t - PAD.b);
  const r = Math.min(3, barW / 2);
  const bar = (i: number, s: number) => {
    const top = Math.min(y(s), H - PAD.b - r);
    return `M${cx(i) - barW / 2},${H - PAD.b}V${top + r}a${r},${r} 0 0 1 ${r},${-r}H${cx(i) + barW / 2 - r}a${r},${r} 0 0 1 ${r},${r}V${H - PAD.b}Z`;
  };
  const bestIndex = results.reduce((b, res, i) => (res.seconds < results[b].seconds ? i : b), 0);
  const ticks = [0, max / 2, max].map((s) => Math.round(s));
  const dateLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale, { month: "short", day: "numeric" });
  const hovered = hover !== null ? results[hover] : null;
  return (
    <div className="relative mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full overflow-visible" onPointerLeave={() => setHover(null)}>
        {ticks.map((s) => (
          <g key={s}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(s)} y2={y(s)} className="stroke-line" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(s) + 3} textAnchor="end" className="fill-muted text-[9px] tabular-nums">
              {formatDuration(s)}
            </text>
          </g>
        ))}
        <text x={PAD.l} y={H - 6} className="fill-muted text-[9px]">{dateLabel(results[0].day)}</text>
        {results.length > 1 && (
          <text x={W - PAD.r} y={H - 6} textAnchor="end" className="fill-muted text-[9px]">{dateLabel(results[results.length - 1].day)}</text>
        )}
        <g>
          {results.map((res, i) => (
            <path key={res.day} d={bar(i, res.seconds)} className={`${i === bestIndex ? "fill-gold-400" : "fill-brand-500"} ${hover === i ? "opacity-80" : ""}`} />
          ))}
          {detail && average !== null && <line x1={PAD.l} x2={W - PAD.r} y1={y(average)} y2={y(average)} className="stroke-ink-soft" strokeWidth="1" strokeDasharray="3 3" />}
        </g>
        {detail &&
          results.map((res, i) => (
            <rect key={res.day} x={cx(i) - slot / 2} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" onPointerEnter={() => setHover(i)} />
          ))}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-overlay">
          <span className="text-muted">{dateLabel(hovered.day)}</span> <span className="font-semibold tabular-nums text-ink">{formatDuration(hovered.seconds)}</span>
        </div>
      )}
      {average !== null && (
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {detail && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-dashed border-ink-soft" aria-hidden="true" />
              {t("stats.averageLine", { time: formatDuration(average) })}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-gold-400" aria-hidden="true" />
            {t("stats.bestDot", { time: formatDuration(results[bestIndex].seconds) })}
          </span>
        </p>
      )}
    </div>
  );
}

/** Average time per weekday, Monday first; a weekday without a result has no bar. */
function WeekdayChart({ averages, names, label }: { averages: (number | null)[]; names: string[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...averages.map((a) => a ?? 0)) * 1.1;
  const slot = (W - PAD.l - PAD.r) / 7;
  const barW = Math.min(28, slot - 8);
  const y = (s: number) => PAD.t + (1 - s / max) * (H - PAD.t - PAD.b);
  return (
    <div className="relative mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full overflow-visible" onPointerLeave={() => setHover(null)}>
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-line" strokeWidth="1" />
        {averages.map((a, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          return (
            <g key={i} onPointerEnter={() => setHover(i)}>
              <rect x={cx - slot / 2} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" />
              {a !== null && (
                <text x={cx} y={y(a) - 5} textAnchor="middle" className="fill-ink-soft text-[9px] tabular-nums">
                  {formatDuration(a)}
                </text>
              )}
              {a !== null && (
                <path
                  className={`fill-brand-500 ${hover === i ? "opacity-80" : ""}`}
                  d={`M${cx - barW / 2},${H - PAD.b}V${y(a) + 4}a4,4 0 0 1 4,-4H${cx + barW / 2 - 4}a4,4 0 0 1 4,4V${H - PAD.b}Z`}
                />
              )}
              <text x={cx} y={H - 6} textAnchor="middle" className="fill-muted text-[9px]">
                {names[i]}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && averages[hover] !== null && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-overlay">
          <span className="text-muted">{names[hover]}</span> <span className="font-semibold tabular-nums text-ink">{formatDuration(averages[hover]!)}</span>
        </div>
      )}
    </div>
  );
}

const CELL = { solved: "fill-brand-500", repaired: "fill-gold-400", none: "fill-surface-sunken", future: "fill-transparent" } as const;

/** The last 26 weeks, a column per week (Monday on top): solved, repaired or neither. */
function Calendar({ weeks, label }: { weeks: ReturnType<typeof calendarWeeks>; label: string }) {
  const size = 11;
  const gap = 2;
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${weeks.length * (size + gap) - gap} ${7 * (size + gap) - gap}`} role="img" aria-label={label} className="w-full max-w-[560px]">
        {weeks.map((col, w) =>
          col.map((cell, d) => (
            <rect key={cell.day} x={w * (size + gap)} y={d * (size + gap)} width={size} height={size} rx="2.5" className={CELL[cell.state]}>
              <title>{cell.day}</title>
            </rect>
          )),
        )}
      </svg>
    </div>
  );
}
