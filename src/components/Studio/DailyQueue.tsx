import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, KeyRound, RefreshCw, X } from "lucide-react";
import { Button, Card, Eyebrow, Select } from "../ui";
import { setStudioToken, useStudioToken } from "../../hooks/useStudioToken";
import { DAILY_SLOTS, type DailySlot } from "../../lib/dailyFeed";
import {
  defaultSlotFor,
  fetchStockedDays,
  listSchedule,
  scheduleDay,
  scheduleProblems,
  servingFor,
  servingKey,
  unscheduleDay,
  upcomingDays,
  type ScheduledDay,
  type StockedDay,
} from "../../lib/seedgrid/studioSchedule";
import { StudioClaudeError } from "../../lib/seedgrid/studioClaude";
import type { StudioState } from "../../lib/seedgrid/studioState";

const SHOWN_DAYS = 14;
const PICKABLE_DAYS = 60;

const SLOT_LABEL: Record<DailySlot, string> = { mini: "Mini", midi: "Midi", large: "Large" };
/** What a day shows in a slot nobody has scheduled: the mini has a bundled rotation, the large has nothing. */
const EMPTY_LABEL: Record<DailySlot, string> = { mini: "Rotation", midi: "—", large: "—" };

const CHIP = "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
/** A committed feed file: served whatever the schedule says. */
const FILE_CHIP = `${CHIP} bg-surface-sunken text-ink-soft`;
/** A snapshot in the daily_schedule table. */
const QUEUE_CHIP = `${CHIP} bg-brand-50 text-brand-700`;

const INPUT =
  "h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-base md:text-sm text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500";

function label(day: string, today: string): string {
  if (day === today) return "Today";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

const keyOf = servingKey;

/**
 * The admin daily queue: the next two weeks at a glance — all three slots for
 * every day, each saying what it will actually serve: a committed feed file
 * (from the daily index), else the scheduled snapshot, else the mini's bundled
 * rotation — and "Schedule this puzzle" to make the open puzzle a day's daily
 * in a chosen slot (the slot defaults to the one its grid size belongs in). A
 * scheduled day is a snapshot; schedule again after editing to update it, and
 * it is only served once no file is committed for that day. Open to a
 * signed-in studio admin or with the studio token.
 */
export function DailyQueue({ state, admin }: { state: StudioState; admin: boolean }) {
  const token = useStudioToken();
  const [tokenDraft, setTokenDraft] = useState("");
  const [days, setDays] = useState<ScheduledDay[] | null>(null);
  const [stocked, setStocked] = useState<StockedDay[]>([]);
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
  const fileByKey = useMemo(() => new Map(stocked.map((d) => [keyOf(d.day, d.slot), d])), [stocked]);
  const serving = (d: string, s: DailySlot) => servingFor(s, fileByKey.get(keyOf(d, s)), byKey.get(keyOf(d, s)));
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

  // The committed files are public static JSON: read once, no token needed.
  useEffect(() => {
    let live = true;
    void fetchStockedDays(upcoming[0], upcoming[upcoming.length - 1]).then((rows) => live && setStocked(rows));
    return () => {
      live = false;
    };
  }, [upcoming]);

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
          <li key={d} className="py-1.5 text-sm">
            {/* The day heads its three rows: beside them, a 17rem sidebar left two letters of each title. */}
            <p className={`px-2 text-xs font-semibold uppercase tracking-[0.08em] ${d === today ? "text-brand-700" : "text-muted"}`}>{label(d, today)}</p>
            <div className="mt-0.5 flex min-w-0 flex-col">
              {DAILY_SLOTS.map((s) => {
                const entry = byKey.get(keyOf(d, s));
                const served = serving(d, s);
                const removing = confirmRemove === keyOf(d, s);
                return (
                  <div key={s} className={`flex min-h-9 items-center gap-2 rounded-lg px-2 ${entry?.studio_id === state.id ? "bg-brand-50" : ""}`}>
                    <span className="w-10 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-subtle">{SLOT_LABEL[s]}</span>
                    {served.kind === "file" && !removing ? (
                      <>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-medium text-ink">{served.title || "Untitled"}</span>
                            <span className={FILE_CHIP} title="A feed file committed to the site; it is served whatever the queue says">File</span>
                          </span>
                          {served.shadowed && (
                            <span className="text-xs text-muted">Queued “{served.shadowed.title || "Untitled"}” won't be served while the file exists.</span>
                          )}
                        </span>
                        {served.shadowed && (
                          <button
                            type="button"
                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-ink active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500"
                            aria-label={`Unschedule ${served.shadowed.title || "Untitled"} (${SLOT_LABEL[s]}) on ${label(d, today)}`}
                            onClick={() => setConfirmRemove(keyOf(d, s))}
                          >
                            <X className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </>
                    ) : removing ? (
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
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="truncate font-medium text-ink">{entry.title || "Untitled"}</span>
                          <span className={QUEUE_CHIP} title="A snapshot in the daily schedule, served because no file is committed for this day">Queue</span>
                        </span>
                        <button
                          type="button"
                          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-ink active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500"
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
                const served = serving(d, slot);
                const note = served.kind === "file" ? ` · ${served.title || "Untitled"} (file)` : served.kind === "scheduled" ? ` · ${served.entry.title || "Untitled"}` : "";
                return { value: d, label: `${label(d, today)}${note}` };
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
          {fileByKey.has(keyOf(day, slot)) && (
            <p className="text-xs text-ink-soft">
              “{fileByKey.get(keyOf(day, slot))!.title || "Untitled"}” is committed as that day's {SLOT_LABEL[slot]}; the queue is only served once the file is removed from the site.
            </p>
          )}
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
