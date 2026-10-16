import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, KeyRound, RefreshCw, X } from "lucide-react";
import { Button, Card, Eyebrow, Select } from "../ui";
import { setStudioToken, useStudioToken } from "../../hooks/useStudioToken";
import { DAILY_SLOTS, type DailySlot } from "../../lib/dailyFeed";
import { defaultSlotFor, listSchedule, scheduleDay, scheduleProblems, unscheduleDay, upcomingDays, type ScheduledDay } from "../../lib/seedgrid/studioSchedule";
import { StudioClaudeError } from "../../lib/seedgrid/studioClaude";
import type { StudioState } from "../../lib/seedgrid/studioState";

const SHOWN_DAYS = 14;
const PICKABLE_DAYS = 60;

const SLOT_LABEL: Record<DailySlot, string> = { mini: "Mini", large: "Large" };
/** What a day shows in a slot nobody has scheduled: the mini has a bundled rotation, the large has nothing. */
const EMPTY_LABEL: Record<DailySlot, string> = { mini: "Rotation", large: "—" };

const INPUT =
  "h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-base md:text-sm text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500";

function label(day: string, today: string): string {
  if (day === today) return "Today";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

const keyOf = (day: string, slot: DailySlot) => `${day}:${slot}`;

/**
 * The admin daily queue: the next two weeks at a glance — both slots, the
 * mini and the 15×15 large, for every day — and "Schedule this puzzle" to
 * make the open puzzle a day's daily in a chosen slot (the slot defaults to
 * the one its grid size belongs in). A scheduled day is a snapshot; schedule
 * again after editing to update it. Mini days left empty fall back to the
 * bundled rotation; large days left empty have no large. Open to a signed-in
 * studio admin or with the studio token.
 */
export function DailyQueue({ state, admin }: { state: StudioState; admin: boolean }) {
  const token = useStudioToken();
  const [tokenDraft, setTokenDraft] = useState("");
  const [days, setDays] = useState<ScheduledDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const upcoming = useMemo(() => upcomingDays(new Date(), PICKABLE_DAYS), []);
  const today = upcoming[0];
  const [day, setDay] = useState(upcoming[1]);
  // Follows the grid's size until the constructor picks a slot by hand.
  const [slotChoice, setSlotChoice] = useState<DailySlot | null>(null);
  const slot = slotChoice ?? defaultSlotFor(state.grid.width, state.grid.height);
  const [menuLabel, setMenuLabel] = useState("");

  const byKey = useMemo(() => new Map((days ?? []).map((d) => [keyOf(d.day, d.slot), d])), [days]);
  const problems = scheduleProblems(state);
  const mine = (days ?? []).filter((d) => d.studio_id === state.id);

  const run = useCallback(
    async (work: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await work();
      } catch (err) {
        if (err instanceof StudioClaudeError && err.kind === "token") {
          // Ask for it again rather than leaving the queue stuck.
          setStudioToken("");
          setError("The studio token wasn't accepted.");
        } else setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const refresh = useCallback(
    () => run(async () => setDays(await listSchedule(token, upcoming[0], upcoming[upcoming.length - 1]))),
    [run, token, upcoming],
  );

  useEffect(() => {
    if (token || admin) void refresh();
  }, [token, admin, refresh]);

  if (!token && !admin) {
    return (
      <Card className="p-4">
        <Eyebrow as="h2">Daily queue</Eyebrow>
        <p className="mt-1 text-sm text-muted">Sign in as a studio admin, or enter the studio token.</p>
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setStudioToken(tokenDraft);
            setTokenDraft("");
          }}
        >
          <KeyRound className="size-4 text-muted" aria-hidden="true" />
          <label className="sr-only" htmlFor="queue-token">Studio token</label>
          <input id="queue-token" type="password" autoComplete="off" placeholder="Studio token" className={INPUT} value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} />
          <Button size="sm" type="submit" disabled={!tokenDraft.trim()}>Save</Button>
        </form>
        {error && <p role="alert" className="mt-2 text-sm text-ink-soft">{error}</p>}
      </Card>
    );
  }

  const taken = byKey.get(keyOf(day, slot));
  const slotOf = (d: ScheduledDay) => `${label(d.day, today)} · ${SLOT_LABEL[d.slot]}`;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <Eyebrow as="h2">Daily queue</Eyebrow>
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-ink active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500"
          aria-label="Refresh the queue"
          onClick={() => void refresh()}
          disabled={busy}
        >
          <RefreshCw className={`size-4 ${busy ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />
        </button>
      </div>

      <ul className="mt-1 flex flex-col divide-y divide-line/60">
        {upcoming.slice(0, SHOWN_DAYS).map((d) => (
          <li key={d} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-2 py-1 text-sm">
            <span className={`pt-1.5 ${d === today ? "font-semibold text-ink" : "text-muted"}`}>{label(d, today)}</span>
            <div className="flex min-w-0 flex-col">
              {DAILY_SLOTS.map((s) => {
                const entry = byKey.get(keyOf(d, s));
                const removing = confirmRemove === keyOf(d, s);
                return (
                  <div key={s} className={`flex min-h-8 items-center gap-2 rounded-lg px-2 ${entry?.studio_id === state.id ? "bg-brand-50" : ""}`}>
                    <span className="w-10 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-subtle">{SLOT_LABEL[s]}</span>
                    {removing ? (
                      <span className="flex flex-1 items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(null)}>Keep</Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setConfirmRemove(null);
                            void run(async () => {
                              await unscheduleDay(token, d, s);
                              setDays(await listSchedule(token, upcoming[0], upcoming[upcoming.length - 1]));
                            });
                          }}
                        >
                          Unschedule
                        </Button>
                      </span>
                    ) : entry ? (
                      <>
                        <span className="flex-1 truncate font-medium text-ink">{entry.title || "Untitled"}</span>
                        <button
                          type="button"
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-ink active:bg-line"
                          aria-label={`Unschedule ${entry.title || "Untitled"} (${SLOT_LABEL[s]}) on ${label(d, today)}`}
                          onClick={() => setConfirmRemove(keyOf(d, s))}
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </>
                    ) : (
                      <span className="flex-1 text-subtle">{days ? EMPTY_LABEL[s] : "…"}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 border-t border-line pt-3">
        <p className="text-sm font-medium text-ink-soft">
          Schedule “{state.title.trim() || "Untitled"}”
          {mine.length > 0 && <span className="font-normal text-muted"> · on {mine.map(slotOf).join(", ")}</span>}
        </p>
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex gap-2">
            <Select
              aria-label="Day"
              block
              className="min-w-0 flex-1"
              value={day}
              options={upcoming.map((d) => {
                const t = byKey.get(keyOf(d, slot));
                return { value: d, label: `${label(d, today)}${t ? ` · ${t.title || "Untitled"}` : ""}` };
              })}
              onChange={setDay}
            />
            <Select<DailySlot>
              aria-label="Slot"
              className="w-28 shrink-0"
              value={slot}
              options={DAILY_SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))}
              onChange={setSlotChoice}
            />
          </div>
          <input
            className={INPUT}
            aria-label="Menu label"
            placeholder="Menu label (optional), e.g. Piano"
            maxLength={24}
            value={menuLabel}
            onChange={(e) => setMenuLabel(e.target.value)}
          />
          {taken && taken.studio_id !== state.id && <p className="text-xs text-ink-soft">Replaces “{taken.title || "Untitled"}” as that day's {SLOT_LABEL[slot]}.</p>}
          {slot !== defaultSlotFor(state.grid.width, state.grid.height) && (
            <p className="text-xs text-muted">A {state.grid.width}×{state.grid.height} usually goes in the {SLOT_LABEL[defaultSlotFor(state.grid.width, state.grid.height)]} slot.</p>
          )}
          {problems.length > 0 && <p className="text-xs text-muted">Before scheduling: {problems.join(" ")}</p>}
          <Button
            variant="soft"
            size="sm"
            disabled={busy || problems.length > 0}
            onClick={() =>
              void run(async () => {
                await scheduleDay(token, day, slot, state, menuLabel);
                setDays(await listSchedule(token, upcoming[0], upcoming[upcoming.length - 1]));
              })
            }
          >
            <CalendarPlus className="size-4" aria-hidden="true" /> {taken?.studio_id === state.id ? "Update this day" : `Schedule as ${SLOT_LABEL[slot]}`}
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 rounded-xl bg-gold-50 px-3 py-2 text-sm text-ink-soft">{error}</p>}
    </Card>
  );
}
