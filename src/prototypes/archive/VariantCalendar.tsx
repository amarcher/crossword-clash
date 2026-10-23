/**
 * PROTOTYPE A — Calendar. A month grid (Sunday start); every day cell shows
 * one dot per published daily (filled = solved, gold = in progress, hollow =
 * unsolved). Tapping a day opens its puzzles below the grid — the cell is the
 * ~46px target, not three 15px buttons. Selected day = tinted fill (no bars).
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Swords } from "lucide-react";
import { Button, Eyebrow } from "../../components/ui";
import { ShapeThumb, StatusChip, primaryLabel, statusText, useSlotLabel } from "./bits";
import { SLOT_ORDER, longDay, monthLabel, toDate, weekdayInitial, type ArchiveItem } from "./archiveData";
import type { VariantProps } from "./ArchivePrototypeScreen";

const DOT: Record<ArchiveItem["status"], string> = {
  solved: "bg-brand-600",
  inprogress: "bg-gold-500",
  unsolved: "bg-surface ring-1 ring-inset ring-line-strong",
};

export function VariantCalendar({ items, today, onPlay, onRace, busy, canRace }: VariantProps) {
  const { i18n } = useTranslation();
  const slotLabel = useSlotLabel();
  const locale = i18n.language;
  const byDay = useMemo(() => {
    const m = new Map<string, ArchiveItem[]>();
    for (const it of items) m.set(it.day, [...(m.get(it.day) ?? []), it]);
    for (const list of m.values()) list.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
    return m;
  }, [items]);
  const first = items[0]?.day ?? today;
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(byDay.has(today) ? today : (items[items.length - 1]?.day ?? today));

  const [y, mo] = month.split("-").map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const lead = new Date(y, mo - 1, 1).getDay();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);
  const canPrev = month > first.slice(0, 7);
  const canNext = month < today.slice(0, 7);
  const shift = (n: number) => {
    const d = new Date(y, mo - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const panelRef = useRef<HTMLElement>(null);
  const pick = (day: string) => {
    setSelected(day);
    // The day's puzzles sit under the grid; bring them into view on a phone (plain jump under reduced motion).
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }));
  };
  const dayItems = byDay.get(selected) ?? [];
  const solvedInMonth = items.filter((i) => i.day.startsWith(month) && i.status === "solved").length;
  const inMonth = items.filter((i) => i.day.startsWith(month)).length;

  return (
    <div className="pb-28">
      <div className="flex items-center justify-between gap-2 pt-2">
        <button type="button" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month" className="grid size-11 place-items-center rounded-xl text-ink-soft hover:bg-surface-sunken active:bg-line disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-brand-500">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <div className="text-center">
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">{monthLabel(month, locale)}</h2>
          <p className="text-xs text-muted tabular-nums">{solvedInMonth} of {inMonth} solved</p>
        </div>
        <button type="button" onClick={() => shift(1)} disabled={!canNext} aria-label="Next month" className="grid size-11 place-items-center rounded-xl text-ink-soft hover:bg-surface-sunken active:bg-line disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-brand-500">
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div role="grid" aria-label={monthLabel(month, locale)} className="mt-3 rounded-2xl border border-line bg-surface p-2 shadow-card">
        <div role="row" className="grid grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} role="columnheader" className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-subtle">
              {weekdayInitial(i, locale)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`pad-${i}`} role="gridcell" aria-hidden="true" />;
            const list = byDay.get(day) ?? [];
            const future = day > today;
            const empty = list.length === 0;
            const isSelected = day === selected;
            const label = `${longDay(day, locale)}: ${empty ? (future ? "not yet" : "no puzzles") : list.map((it) => `${slotLabel(it.slot)} ${statusText(it)}`).join(", ")}`;
            return (
              <div key={day} role="gridcell" className="flex justify-center">
                <button
                  type="button"
                  disabled={empty}
                  aria-label={label}
                  aria-pressed={isSelected}
                  aria-current={day === today ? "date" : undefined}
                  onClick={() => pick(day)}
                  className={`flex h-12 w-full max-w-12 flex-col items-center justify-center gap-1 rounded-xl text-sm font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
                    isSelected ? "bg-brand-600 text-white" : empty ? "text-subtle/60" : "text-ink hover:bg-surface-sunken active:bg-line"
                  } ${day === today && !isSelected ? "ring-1 ring-inset ring-brand-500" : ""}`}
                >
                  <span>{toDate(day).getDate()}</span>
                  <span className="flex h-1.5 gap-1" aria-hidden="true">
                    {list.map((it) => (
                      <span key={it.slot} className={`size-1.5 rounded-full ${isSelected ? (it.status === "unsolved" ? "ring-1 ring-inset ring-white/70" : it.status === "inprogress" ? "bg-gold-400" : "bg-white") : DOT[it.status]}`} />
                    ))}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${DOT.solved}`} aria-hidden="true" /> Solved</li>
        <li className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${DOT.inprogress}`} aria-hidden="true" /> In progress</li>
        <li className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${DOT.unsolved}`} aria-hidden="true" /> Unsolved</li>
      </ul>

      <section ref={panelRef} aria-live="polite" className="mt-5 scroll-mt-4">
        <h3 className="font-display text-lg font-bold tracking-tight text-ink">{longDay(selected, locale)}</h3>
        {dayItems.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing published on this day.</p>
        ) : (
          <ul className="mt-2 space-y-2.5">
            {dayItems.map((it) => (
              <li key={it.slot} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card">
                <ShapeThumb blocks={it.blocks} className="w-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Eyebrow className="text-brand-600">{slotLabel(it.slot)}</Eyebrow>
                    <StatusChip item={it} />
                  </div>
                  <p className="mt-0.5 truncate font-display text-base font-semibold leading-snug text-ink">{it.title}</p>
                  <p className="truncate text-xs text-muted tabular-nums">{it.width}×{it.height} · {it.clues} clues{it.theme ? ` · ${it.theme}` : ""}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <Button size="sm" variant={it.status === "unsolved" || it.status === "inprogress" ? "primary" : "secondary"} onClick={() => onPlay(it)} disabled={busy !== null}>
                    {busy === it.identity ? "Loading…" : primaryLabel(it)}
                  </Button>
                  {canRace && (
                    <Button size="sm" variant="ghost" onClick={() => onRace(it)} disabled={busy !== null} aria-label={`Race a friend on ${it.title}`}>
                      <Swords className="size-4" aria-hidden="true" /> Race
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
