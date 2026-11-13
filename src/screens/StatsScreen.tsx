import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { Button, Card, Eyebrow } from "../components/ui";
import { useMaybeAccount } from "../contexts/AccountContext";
import { useSolveHistory } from "../hooks/useSolveHistory";
import { countsForDailyStreak } from "../lib/solveHistory";
import { REPAIR_KEY_PREFIX } from "../lib/streakRepair";
import { averageByWeekday, calendarWeeks, fetchStats, summarizeSlot, type DailyResult, type StatsData } from "../lib/stats";
import { dayKey, formatDuration, shiftDayKey } from "../lib/soloStats";
import { DAILY_SLOTS, type DailySlot } from "../lib/dailyFeed";

const SLOT_LABEL = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const;

/** What a free player's page is drawn with: believable shapes, never real figures (the server sends them nothing). */
function placeholderStats(today: string): StatsData {
  const results: DailyResult[] = [];
  for (let i = 40; i >= 1; i--) {
    const day = shiftDayKey(today, -i);
    for (const [slot, base] of [["mini", 70], ["midi", 210], ["large", 640]] as const) {
      // An uneven, made-up line: no real figure is ever drawn here.
      const wobble = Math.round((Math.sin(i * 2.3 + base) * 0.6 + Math.sin(i * 0.7) * 0.3 + Math.cos(i * 5.1) * 0.25) * base * 0.3);
      results.push({ day, slot, seconds: base + wobble, solvers: 40, fasterThan: 0.6 + Math.sin(i) * 0.2 });
    }
  }
  return {
    results,
    headToHead: [
      { friendId: "a", username: "friend", played: 12, wins: 7, losses: 5, ties: 0 },
      { friendId: "b", username: "another", played: 8, wins: 3, losses: 5, ties: 0 },
    ],
    slowClues: [
      { puzzleTitle: "A daily", clue: "12A", seconds: 95, day: today },
      { puzzleTitle: "Another daily", clue: "3D", seconds: 71, day: today },
    ],
  };
}

/** A figure that is blurred (and hidden from assistive tech) on a free player's page. */
function Fig({ locked, children }: { locked: boolean; children: React.ReactNode }) {
  return locked ? (
    <span aria-hidden="true" className="select-none blur-[6px]">
      {children}
    </span>
  ) : (
    <>{children}</>
  );
}

/**
 * `/stats` — deeper stats (docs/plus-expansion-spec.md §3; the page is Plus).
 * Times over time, by weekday, where you rank, head-to-head with friends,
 * the slowest clues, and a solved-days calendar. A free player sees every card
 * with its real labels and layout and the figures blurred, and one way in to Plus.
 */
export function StatsScreen() {
  const { t, i18n } = useTranslation();
  const account = useMaybeAccount();
  const history = useSolveHistory();
  const today = dayKey(new Date());
  const plus = !!account?.plus;
  // Without accounts in this build there is no Plus to check: the page shows its locked state.
  const known = (!!account?.ready && !!account?.plusReady) || account?.available === false || !account;
  const [data, setData] = useState<StatsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [slot, setSlot] = useState<DailySlot>("mini");

  useEffect(() => {
    if (!known || !plus) return;
    let live = true;
    fetchStats(shiftDayKey(today, -365)).then(
      (d) => live && setData(d),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [known, plus, today]);

  const locked = known && !plus;
  const shown = locked ? placeholderStats(today) : data;
  const slotResults = useMemo(() => (shown ? shown.results.filter((r) => r.slot === slot) : []), [shown, slot]);
  const summary = summarizeSlot(slotResults);
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
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t("stats.average")} value={summary.average === null ? "–" : formatDuration(summary.average)} locked={locked} />
            <Stat label={t("stats.best")} value={summary.best ? formatDuration(summary.best.seconds) : "–"} locked={locked} />
            <Stat label={t("stats.fasterThan")} value={summary.fasterThan === null ? "–" : `${Math.round(summary.fasterThan * 100)}%`} locked={locked} />
            <Stat label={t("stats.solved")} value={String(summary.count)} locked={locked} />
          </dl>
          {locked && (
            <Button className="mt-5" block onClick={() => account?.openPaywall({ placement: "stats", feature: "stats", returnTo: "/stats" })}>
              <Sparkles className="size-4" aria-hidden="true" />
              {t("stats.seeWithPlus")}
            </Button>
          )}
        </Card>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <Eyebrow as="h2">{t("stats.overTime")}</Eyebrow>
            {slotResults.length > 1 ? (
              <TimesChart results={slotResults} average={summary.average} locked={locked} locale={i18n.language} label={t("stats.overTime")} />
            ) : (
              <p className="mt-3 text-sm text-muted">{shown ? t("stats.notEnough") : t("stats.loading")}</p>
            )}
          </Card>

          <Card className="p-5">
            <Eyebrow as="h2">{t("stats.byWeekday")}</Eyebrow>
            <WeekdayChart averages={weekdays} names={weekdayNames} locked={locked} label={t("stats.byWeekday")} />
          </Card>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <Eyebrow as="h2">{t("stats.headToHead")}</Eyebrow>
            {shown && shown.headToHead.length > 0 ? (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
                    <th scope="col" className="pb-2">{t("stats.friend")}</th>
                    <th scope="col" className="pb-2 text-right">{t("stats.record")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.headToHead.map((h) => (
                    <tr key={h.friendId}>
                      <td className="py-2 font-semibold text-ink">
                        <Fig locked={locked}>@{h.username}</Fig>
                      </td>
                      <td className="py-2 text-right tabular-nums text-ink-soft">
                        <Fig locked={locked}>{t("stats.recordLine", { wins: h.wins, losses: h.losses, ties: h.ties })}</Fig>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-3 text-sm text-muted">{shown ? t("stats.noFriends") : t("stats.loading")}</p>
            )}
          </Card>

          <Card className="p-5">
            <Eyebrow as="h2">{t("stats.slowClues")}</Eyebrow>
            {shown && shown.slowClues.length > 0 ? (
              <ol className="mt-3 grid gap-2 text-sm">
                {shown.slowClues.map((c, i) => (
                  <li key={`${c.puzzleTitle}-${c.clue}-${i}`} className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate text-ink">
                      <Fig locked={locked}>
                        <span className="font-semibold">{c.clue}</span> · {c.puzzleTitle}
                      </Fig>
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-soft">
                      <Fig locked={locked}>{formatDuration(c.seconds)}</Fig>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted">{shown ? t("stats.noClues") : t("stats.loading")}</p>
            )}
          </Card>
        </div>

        {calendar && (
          <Card className="p-5">
            <Eyebrow as="h2">{t("stats.calendar")}</Eyebrow>
            <Calendar weeks={calendar} locked={locked} label={t("stats.calendar")} />
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

function Stat({ label, value, locked }: { label: string; value: string; locked: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">
        <Fig locked={locked}>{value}</Fig>
      </dd>
    </div>
  );
}

const W = 320;
const H = 150;
const PAD = { l: 40, r: 8, t: 10, b: 22 };

/** Your times in a slot, one point per day, with the average as a dashed rule; hover a day for its time. */
function TimesChart({ results, average, locked, locale, label }: { results: DailyResult[]; average: number | null; locked: boolean; locale: string; label: string }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...results.map((r) => r.seconds), average ?? 0) * 1.1;
  const x = (i: number) => PAD.l + (i / Math.max(1, results.length - 1)) * (W - PAD.l - PAD.r);
  const y = (s: number) => PAD.t + (1 - s / max) * (H - PAD.t - PAD.b);
  const path = results.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.seconds).toFixed(1)}`).join("");
  const bestIndex = results.reduce((b, r, i) => (r.seconds < results[b].seconds ? i : b), 0);
  const ticks = [0, max / 2, max].map((s) => Math.round(s));
  const dateLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale, { month: "short", day: "numeric" });
  const hovered = hover !== null ? results[hover] : null;
  return (
    <div className="relative mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full overflow-visible" onPointerLeave={() => setHover(null)}>
        {ticks.map((s) => (
          <g key={s}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(s)} y2={y(s)} className="stroke-line" strokeWidth="1" />
            {!locked && (
              <text x={PAD.l - 6} y={y(s) + 3} textAnchor="end" className="fill-muted text-[9px] tabular-nums">
                {formatDuration(s)}
              </text>
            )}
          </g>
        ))}
        <text x={PAD.l} y={H - 6} className="fill-muted text-[9px]">{dateLabel(results[0].day)}</text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="fill-muted text-[9px]">{dateLabel(results[results.length - 1].day)}</text>
        <g className={locked ? "blur-[3px]" : ""}>
          {average !== null && <line x1={PAD.l} x2={W - PAD.r} y1={y(average)} y2={y(average)} className="stroke-ink-soft" strokeWidth="1" strokeDasharray="3 3" />}
          <path d={path} fill="none" className="stroke-brand-500" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(bestIndex)} cy={y(results[bestIndex].seconds)} r="4" className="fill-brand-500 stroke-surface" strokeWidth="2" />
          {hover !== null && !locked && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="stroke-ink-soft" strokeWidth="1" />
              <circle cx={x(hover)} cy={y(results[hover].seconds)} r="4" className="fill-brand-500 stroke-surface" strokeWidth="2" />
            </>
          )}
        </g>
        {!locked &&
          results.map((r, i) => (
            <rect
              key={r.day}
              x={x(i) - (W - PAD.l - PAD.r) / results.length / 2}
              y={PAD.t}
              width={(W - PAD.l - PAD.r) / results.length}
              height={H - PAD.t - PAD.b}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
            />
          ))}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-overlay">
          <span className="text-muted">{dateLabel(hovered.day)}</span> <span className="font-semibold tabular-nums text-ink">{formatDuration(hovered.seconds)}</span>
        </div>
      )}
      {!locked && average !== null && (
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 border-t border-dashed border-ink-soft" aria-hidden="true" />
            {t("stats.averageLine", { time: formatDuration(average) })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-brand-500" aria-hidden="true" />
            {t("stats.bestDot", { time: formatDuration(results[bestIndex].seconds) })}
          </span>
        </p>
      )}
    </div>
  );
}

/** Average time per weekday, Monday first; a weekday without a result has no bar. */
function WeekdayChart({ averages, names, locked, label }: { averages: (number | null)[]; names: string[]; locked: boolean; label: string }) {
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
              {a !== null && !locked && (
                <text x={cx} y={y(a) - 5} textAnchor="middle" className="fill-ink-soft text-[9px] tabular-nums">
                  {formatDuration(a)}
                </text>
              )}
              {a !== null && (
                <path
                  className={`fill-brand-500 ${locked ? "blur-[3px]" : ""} ${hover === i && !locked ? "opacity-80" : ""}`}
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
      {hover !== null && !locked && averages[hover] !== null && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-overlay">
          <span className="text-muted">{names[hover]}</span> <span className="font-semibold tabular-nums text-ink">{formatDuration(averages[hover]!)}</span>
        </div>
      )}
    </div>
  );
}

const CELL = { solved: "fill-brand-500", repaired: "fill-gold-400", none: "fill-surface-sunken", future: "fill-transparent" } as const;

/** The last 26 weeks, a column per week (Monday on top): solved, repaired or neither. */
function Calendar({ weeks, locked, label }: { weeks: ReturnType<typeof calendarWeeks>; locked: boolean; label: string }) {
  const size = 11;
  const gap = 2;
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${weeks.length * (size + gap) - gap} ${7 * (size + gap) - gap}`} role="img" aria-label={label} className={`w-full max-w-[560px] ${locked ? "blur-[3px]" : ""}`}>
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
