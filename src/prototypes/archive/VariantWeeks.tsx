/**
 * PROTOTYPE B — Agenda list. One row per published daily, newest first,
 * grouped under week headings ("This week", "Last week", "Oct 5 – 11"), with
 * a sticky filter bar (slot chips + Hide solved) in the classics' pattern.
 * The whole row is the play target; Race is a small trailing button.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EyeOff, Swords } from "lucide-react";
import { ShapeThumb, StatusChip, useSlotLabel } from "./bits";
import { groupByWeek, toDate } from "./archiveData";
import type { DailySlot } from "../../lib/dailyFeed";
import type { VariantProps } from "./ArchivePrototypeScreen";

type Filter = DailySlot | "all";

export function VariantWeeks({ items, today, onPlay, onRace, busy, canRace }: VariantProps) {
  const { i18n } = useTranslation();
  const slotLabel = useSlotLabel();
  const locale = i18n.language;
  const [filter, setFilter] = useState<Filter>("all");
  const [hideSolved, setHideSolved] = useState(false);
  const [weeksShown, setWeeksShown] = useState(4);

  const visible = useMemo(
    () => items.filter((it) => (filter === "all" || it.slot === filter) && !(hideSolved && it.status === "solved")),
    [items, filter, hideSolved],
  );
  const weeks = useMemo(() => groupByWeek(visible, today, locale), [visible, today, locale]);
  const solvedCount = items.filter((it) => it.status === "solved").length;

  const chipBase = "inline-flex shrink-0 items-center justify-center gap-1.5 min-h-10 px-3.5 rounded-full text-sm font-semibold border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";
  const chipOn = `${chipBase} bg-ink text-white border-ink`;
  const chipOff = `${chipBase} bg-surface text-ink-soft border-line-strong hover:bg-surface-sunken active:bg-line`;

  return (
    <div className="pb-28">
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-canvas/90 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["all", "mini", "midi", "large"] as Filter[]).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={filter === f ? chipOn : chipOff}>
              {f === "all" ? "All" : slotLabel(f).replace("Daily ", "")}
            </button>
          ))}
          {solvedCount > 0 && (
            <button type="button" onClick={() => setHideSolved((v) => !v)} aria-pressed={hideSolved} className={hideSolved ? chipOn : chipOff}>
              <EyeOff className="size-4" aria-hidden="true" /> Hide solved
            </button>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm text-muted tabular-nums">{solvedCount} of {items.length} dailies solved since {toDate(items[0]?.day ?? today).toLocaleDateString(locale, { month: "short", day: "numeric" })}.</p>

      {weeks.slice(0, weeksShown).map((week) => (
        <section key={week.start} className="mt-5">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.08em] text-subtle">{week.label}</h2>
          <ul className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-card divide-y divide-line">
            {week.items.map((it, i) => {
              const firstOfDay = i === 0 || week.items[i - 1].day !== it.day;
              const d = toDate(it.day);
              return (
                <li key={`${it.day}-${it.slot}`} className={`flex items-stretch ${it.status === "inprogress" ? "bg-gold-50/60" : ""}`}>
                  <button
                    type="button"
                    onClick={() => onPlay(it)}
                    disabled={busy !== null}
                    aria-label={`${slotLabel(it.slot)}, ${d.toLocaleDateString(locale, { month: "short", day: "numeric" })}, ${it.title}`}
                    className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left hover:bg-surface-sunken/70 active:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
                  >
                    <span className={`w-9 shrink-0 text-center leading-none ${firstOfDay ? "" : "invisible"}`} aria-hidden="true">
                      <span className="block text-[10px] font-semibold uppercase text-subtle">{d.toLocaleDateString(locale, { weekday: "short" })}</span>
                      <span className={`block font-display text-xl font-bold tabular-nums ${it.day === today ? "text-brand-600" : "text-ink"}`}>{d.getDate()}</span>
                    </span>
                    <ShapeThumb blocks={it.blocks} className="w-10 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle">{slotLabel(it.slot).replace("Daily ", "")} · {it.width}×{it.height}{it.theme ? ` · ${it.theme}` : ""}</span>
                      <span className="block truncate font-semibold leading-snug text-ink">{it.title}</span>
                    </span>
                    <StatusChip item={it} className="mr-1" />
                    {it.status === "unsolved" && <span className="mr-1 shrink-0 text-sm font-semibold text-brand-600">Play</span>}
                  </button>
                  {canRace && (
                    <button
                      type="button"
                      onClick={() => onRace(it)}
                      disabled={busy !== null}
                      aria-label={`Race a friend on ${it.title}`}
                      className="grid w-12 shrink-0 place-items-center border-l border-line text-subtle hover:bg-surface-sunken hover:text-ink active:bg-line focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
                    >
                      <Swords className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {weeks.length > weeksShown && (
        <button type="button" onClick={() => setWeeksShown((n) => n + 4)} className="mt-5 w-full rounded-xl border border-line-strong bg-surface py-3 text-sm font-semibold text-ink-soft hover:bg-surface-sunken active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500">
          Earlier weeks
        </button>
      )}
      {weeks.length === 0 && <p className="mt-8 text-center text-sm text-muted">Nothing matches these filters.</p>}
    </div>
  );
}
