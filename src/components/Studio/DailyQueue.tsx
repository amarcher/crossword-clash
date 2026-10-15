import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, KeyRound, RefreshCw, X } from "lucide-react";
import { Button, Card, Eyebrow, Select } from "../ui";
import { setStudioToken, useStudioToken } from "../../hooks/useStudioToken";
import { listSchedule, scheduleDay, scheduleProblems, unscheduleDay, upcomingDays, type ScheduledDay } from "../../lib/seedgrid/studioSchedule";
import { StudioClaudeError } from "../../lib/seedgrid/studioClaude";
import type { StudioState } from "../../lib/seedgrid/studioState";

const SHOWN_DAYS = 14;
const PICKABLE_DAYS = 60;

const INPUT =
  "h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-base md:text-sm text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500";

function label(day: string, today: string): string {
  if (day === today) return "Today";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/**
 * The admin daily queue: the next two weeks at a glance, and "Schedule this
 * puzzle" to make the open puzzle the daily on a chosen day. A scheduled day
 * is a snapshot; schedule again after editing to update it. Days left empty
 * fall back to the bundled rotation.
 */
export function DailyQueue({ state }: { state: StudioState }) {
  const token = useStudioToken();
  const [tokenDraft, setTokenDraft] = useState("");
  const [days, setDays] = useState<ScheduledDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const upcoming = useMemo(() => upcomingDays(new Date(), PICKABLE_DAYS), []);
  const today = upcoming[0];
  const [day, setDay] = useState(upcoming[1]);
  const [menuLabel, setMenuLabel] = useState("");

  const byDay = useMemo(() => new Map((days ?? []).map((d) => [d.day, d])), [days]);
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
    if (token) void refresh();
  }, [token, refresh]);

  if (!token) {
    return (
      <Card className="p-4">
        <Eyebrow as="h2">Daily queue</Eyebrow>
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

  const taken = byDay.get(day);
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

      <ul className="mt-1 flex flex-col">
        {upcoming.slice(0, SHOWN_DAYS).map((d) => {
          const entry = byDay.get(d);
          return (
            <li key={d} className={`flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm ${entry?.studio_id === state.id ? "bg-brand-50" : ""}`}>
              <span className={`w-24 shrink-0 ${d === today ? "font-semibold text-ink" : "text-muted"}`}>{label(d, today)}</span>
              {confirmRemove === d ? (
                <span className="flex flex-1 items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(null)}>Keep</Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setConfirmRemove(null);
                      void run(async () => {
                        await unscheduleDay(token, d);
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
                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-ink active:bg-line"
                    aria-label={`Unschedule ${entry.title || "Untitled"} on ${label(d, today)}`}
                    onClick={() => setConfirmRemove(d)}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </>
              ) : (
                <span className="flex-1 text-subtle">{days ? "Rotation" : "…"}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 border-t border-line pt-3">
        <p className="text-sm font-medium text-ink-soft">
          Schedule “{state.title.trim() || "Untitled"}”
          {mine.length > 0 && <span className="font-normal text-muted"> · on {mine.map((m) => label(m.day, today)).join(", ")}</span>}
        </p>
        <div className="mt-2 flex flex-col gap-2">
          <Select
            aria-label="Day"
            block
            value={day}
            options={upcoming.map((d) => ({ value: d, label: `${label(d, today)}${byDay.get(d) ? ` · ${byDay.get(d)!.title || "Untitled"}` : ""}` }))}
            onChange={setDay}
          />
          <input
            className={INPUT}
            aria-label="Menu label"
            placeholder="Menu label (optional), e.g. Piano"
            maxLength={24}
            value={menuLabel}
            onChange={(e) => setMenuLabel(e.target.value)}
          />
          {taken && taken.studio_id !== state.id && <p className="text-xs text-ink-soft">Replaces “{taken.title || "Untitled"}” on that day.</p>}
          {problems.length > 0 && <p className="text-xs text-muted">Before scheduling: {problems.join(" ")}</p>}
          <Button
            variant="soft"
            size="sm"
            disabled={busy || problems.length > 0}
            onClick={() =>
              void run(async () => {
                await scheduleDay(token, day, state, menuLabel);
                setDays(await listSchedule(token, upcoming[0], upcoming[upcoming.length - 1]));
              })
            }
          >
            <CalendarPlus className="size-4" aria-hidden="true" /> {taken?.studio_id === state.id ? "Update this day" : "Schedule this puzzle"}
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 rounded-xl bg-gold-50 px-3 py-2 text-sm text-ink-soft">{error}</p>}
    </Card>
  );
}
