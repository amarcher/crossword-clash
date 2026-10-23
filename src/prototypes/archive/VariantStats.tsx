/**
 * PROTOTYPE C — Stats first. Status, not date, is the hierarchy: streak and
 * totals on top, the in-progress puzzle as a "pick up" card, then "Catch up"
 * (unsolved, newest first) and "Your solves" (with the fastest per slot
 * marked). Dates are secondary text on each row.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Flame, Play, Swords, Trophy } from "lucide-react";
import { Button, ListGroup, ListRow } from "../../components/ui";
import { formatDuration } from "../../lib/soloStats";
import type { DailySlot } from "../../lib/dailyFeed";
import { ShapeThumb, useSlotLabel } from "./bits";
import { shortDay, type ArchiveItem } from "./archiveData";
import type { VariantProps } from "./ArchivePrototypeScreen";

const SLOTS: DailySlot[] = ["mini", "midi", "large"];

export function VariantStats({ items, today, onPlay, onRace, busy, canRace, streak, classicsSolved, classicsTotal }: VariantProps) {
  const { i18n } = useTranslation();
  const slotLabel = useSlotLabel();
  const locale = i18n.language;
  const [showAllUnsolved, setShowAllUnsolved] = useState(false);
  const [showAllSolved, setShowAllSolved] = useState(false);

  const newestFirst = useMemo(() => [...items].sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? 1 : -1)), [items]);
  const inProgress = newestFirst.find((it) => it.status === "inprogress") ?? null;
  const unsolved = newestFirst.filter((it) => it.status === "unsolved");
  const solved = newestFirst.filter((it) => it.status === "solved");
  const bests = useMemo(() => {
    const out: Partial<Record<DailySlot, ArchiveItem>> = {};
    for (const it of solved) if (it.seconds !== null && (!out[it.slot] || it.seconds < (out[it.slot]!.seconds ?? Infinity))) out[it.slot] = it;
    return out;
  }, [solved]);

  const Row = ({ it, cta }: { it: ArchiveItem; cta: "play" | "again" }) => (
    <li className="flex items-center gap-3 py-2.5 pl-3 pr-2">
      <ShapeThumb blocks={it.blocks} className="w-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle">
          {slotLabel(it.slot).replace("Daily ", "")} · {shortDay(it.day, locale)}{it.day === today ? " · Today" : ""}
        </p>
        <p className="truncate font-semibold leading-snug text-ink">{it.title}</p>
      </div>
      {it.seconds !== null && (
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-ink-soft tabular-nums">
          {bests[it.slot]?.identity === it.identity && <Trophy className="size-3.5 text-gold-500" aria-label="Fastest in this slot" />}
          {formatDuration(it.seconds)}
        </span>
      )}
      <Button size="sm" variant={cta === "play" ? "soft" : "ghost"} onClick={() => onPlay(it)} disabled={busy !== null} aria-label={`${cta === "play" ? "Play" : "Play again"} ${it.title}`}>
        {busy === it.identity ? "…" : cta === "play" ? "Play" : "Again"}
      </Button>
    </li>
  );

  return (
    <div className="pb-28">
      <section className="mt-2 rounded-2xl border border-line bg-surface p-5 shadow-card" aria-label="Your stats">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">Daily streak</p>
            <p className="mt-1 flex items-baseline gap-1.5 font-display text-4xl font-bold tracking-tight text-ink tabular-nums">
              <Flame className="size-7 self-center text-gold-500" aria-hidden="true" />
              {streak}
              <span className="text-base font-semibold text-muted">{streak === 1 ? "day" : "days"}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">Solved</p>
            <p className="mt-1 font-display text-4xl font-bold tracking-tight text-ink tabular-nums">
              {solved.length}
              <span className="text-base font-semibold text-muted"> / {items.length}</span>
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {SLOTS.map((slot) => {
            const b = bests[slot];
            return (
              <div key={slot} className="rounded-xl bg-surface-sunken px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{slotLabel(slot).replace("Daily ", "")} best</dt>
                <dd className="font-display text-lg font-bold text-ink tabular-nums">{b?.seconds != null ? formatDuration(b.seconds) : "—"}</dd>
              </div>
            );
          })}
        </dl>
      </section>

      {inProgress && (
        <section className="mt-4 flex items-center gap-3 rounded-2xl bg-gold-50 p-4 ring-1 ring-gold-100" aria-label="In progress">
          <ShapeThumb blocks={inProgress.blocks} className="w-14 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gold-700">Pick up where you left off</p>
            <p className="truncate font-display text-base font-semibold text-ink">{inProgress.title}</p>
            <p className="truncate text-xs text-muted">{slotLabel(inProgress.slot)} · {shortDay(inProgress.day, locale)}</p>
          </div>
          <Button size="sm" onClick={() => onPlay(inProgress)} disabled={busy !== null}>
            <Play className="size-4" aria-hidden="true" /> Resume
          </Button>
        </section>
      )}

      <section className="mt-6">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">Catch up</h2>
          <span className="text-sm text-muted tabular-nums">{unsolved.length} unsolved</span>
        </div>
        {unsolved.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-line bg-surface p-4 text-sm text-muted shadow-card">You've solved every daily so far.</p>
        ) : (
          <>
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              {(showAllUnsolved ? unsolved : unsolved.slice(0, 5)).map((it) => <Row key={it.identity} it={it} cta="play" />)}
            </ul>
            {unsolved.length > 5 && !showAllUnsolved && (
              <button type="button" onClick={() => setShowAllUnsolved(true)} className="mt-2 w-full py-2 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500">
                Show all {unsolved.length}
              </button>
            )}
          </>
        )}
      </section>

      <section className="mt-6">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">Your solves</h2>
          {canRace && solved[0] && (
            <button type="button" onClick={() => onRace(solved[0])} disabled={busy !== null} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-brand-700">
              <Swords className="size-4" aria-hidden="true" /> Race a friend
            </button>
          )}
        </div>
        {solved.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-line bg-surface p-4 text-sm text-muted shadow-card">Solve a daily and it shows up here with your time.</p>
        ) : (
          <>
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              {(showAllSolved ? solved : solved.slice(0, 6)).map((it) => <Row key={it.identity} it={it} cta="again" />)}
            </ul>
            {solved.length > 6 && !showAllSolved && (
              <button type="button" onClick={() => setShowAllSolved(true)} className="mt-2 w-full py-2 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500">
                Show all {solved.length}
              </button>
            )}
          </>
        )}
      </section>

      <section className="mt-6">
        <ListGroup>
          <ListRow icon={BookOpen} tone="gold" to="/classics" title="Classic library" subtitle={`${classicsSolved} of ${classicsTotal} solved · 1924 book`} />
        </ListGroup>
      </section>
    </div>
  );
}
