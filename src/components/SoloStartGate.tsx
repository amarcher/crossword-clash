import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Flag, Loader2, Swords } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { formatDuration } from "../lib/soloStats";
import { MAX_GHOSTS, type RaceCandidate } from "../lib/race";
import { Button } from "./ui";
import { PlusSeal } from "./ui/PlusBadge";

/** Seconds counted down before a fresh puzzle starts on its own. */
export const START_COUNTDOWN_SECONDS = 3;
/** How long the gate waits to learn whether anyone's solve can be raced before counting down without them. */
export const RACE_OFFER_WAIT_MS = 1200;

/** The solves of this puzzle that can run beside the player's own (race.ts). */
export interface StartGateRace {
  /** False while the list is still being read. */
  ready: boolean;
  candidates: RaceCandidate[];
  /** The viewer holds Plus: a free player is shown the offer as a quiet line that opens the pitch. */
  plus: boolean;
  /** Ids ticked on arrival (a Race tap on a leaderboard row). */
  preselect: string[];
  /** Load the picked solves so they start with the clock; false when none could be loaded. */
  onPick: (userIds: string[]) => Promise<boolean>;
  onPitch: () => void;
}

interface SoloStartGateProps {
  title: string;
  detail?: string;
  race?: StartGateRace;
  /** Leave for Race friends with this puzzle: a live room with friends who have not solved it. */
  onLive?: () => void;
  onStart: () => void;
  onBack: () => void;
}

/**
 * The start of a fresh puzzle (Andrew, 2026-11-18): the grid is on screen,
 * blurred, behind a card. When friends (or anyone) have a solve of it to
 * race, the card first asks who to bring along, with "Play solo" as the
 * default; then it counts 3-2-1 and starts the clock, so the countdown is the
 * last thing before the grid and no clock time is spent choosing. "Start
 * now" skips the count; "Go back" leaves with nothing started. A player
 * without Plus goes straight to the count, with the offer as one line under it.
 */
export function SoloStartGate({ title, detail, race, onLive, onStart, onBack }: SoloStartGateProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onBack);

  // Whether there is anyone to offer is known once the list answers, or after a short wait.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), RACE_OFFER_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const known = !race || race.ready || waited;
  const candidates = race?.ready ? race.candidates : [];
  const friends = candidates.filter((c) => c.friend);

  // "pick": choosing who to race (Plus, someone to race). "count": 3-2-1. "held": the count stopped for the Plus pitch.
  const [chosen, setChosen] = useState(false);
  const [held, setHeld] = useState(false);
  const picking = known && !chosen && !!race?.plus && candidates.length > 0;
  const counting = known && !picking && !held;
  // A list that answers once the count is running does not pull the card back to choosing.
  useEffect(() => {
    if (known && !picking) setChosen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decided at the moment the wait ends
  }, [known]);

  const [picked, setPicked] = useState<string[]>([]);
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !race?.ready) return;
    seeded.current = true;
    setPicked(race.preselect.filter((id) => race.candidates.some((c) => c.userId === id)).slice(0, MAX_GHOSTS));
  }, [race]);
  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : now.length < MAX_GHOSTS ? [...now, id] : now));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const choose = async () => {
    if (!race || busy) return;
    if (picked.length > 0) {
      setBusy(true);
      setFailed(false);
      const ok = await race.onPick(picked);
      setBusy(false);
      if (!ok) {
        setFailed(true);
        return;
      }
    }
    setChosen(true);
  };

  const [left, setLeft] = useState(START_COUNTDOWN_SECONDS);
  const start = useRef(onStart);
  start.current = onStart;
  useEffect(() => {
    if (!counting) return;
    if (left <= 0) {
      start.current();
      return;
    }
    const timer = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left, counting]);

  const offer = friends.length
    ? friends.length === 1
      ? t("soloStart.offerFriend", { name: friends[0].username })
      : t("ghostRace.offerFriends", { name: friends[0].username, count: friends.length - 1 })
    : t("soloStart.offerPublic");

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="solo-start-title"
      data-testid="solo-start-gate"
      className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center overflow-y-auto bg-canvas/50 p-6 backdrop-blur-lg"
      style={{ paddingTop: "max(24px, env(safe-area-inset-top))", paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
    >
      <div className={`w-full rounded-3xl border border-line bg-surface p-6 text-center shadow-overlay ${picking ? "max-w-sm" : "max-w-xs"}`}>
        <h1 id="solo-start-title" className="font-display text-2xl font-bold break-words text-ink">{title}</h1>
        {detail && <p className="mt-1 text-sm text-muted">{detail}</p>}

        {picking ? (
          <div data-testid="start-race-pick" className="mt-4 text-left">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Flag className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
              <span className="min-w-0 flex-1">{offer}</span>
            </p>
            <p className="mt-1 text-xs leading-snug text-muted">{t("soloStart.pickBody", { max: MAX_GHOSTS })}</p>
            <ul className="mt-2 flex max-h-[min(13.75rem,38dvh)] flex-col overflow-y-auto rounded-xl border border-line">
              {candidates.map((c) => {
                const on = picked.includes(c.userId);
                return (
                  <li key={c.userId} className="border-t border-line first:border-0">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 text-sm hover:bg-surface-sunken has-disabled:cursor-default has-disabled:opacity-50">
                      <input type="checkbox" className="size-4 accent-brand-600" checked={on} disabled={busy || (!on && picked.length >= MAX_GHOSTS)} onChange={() => toggle(c.userId)} />
                      <span className="min-w-0 flex-1 truncate font-semibold text-ink">{c.username}</span>
                      {c.friend && <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand-700 uppercase">{t("ghostRace.friend")}</span>}
                      {c.seconds !== null && <span className="text-xs text-muted tabular-nums">{formatDuration(c.seconds)}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            {failed && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{t("ghostRace.failed")}</p>}
            <div className="mt-4 grid gap-3">
              <Button size="lg" onClick={() => void choose()} disabled={busy} aria-busy={busy || undefined}>
                {busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {picked.length > 0 ? t("soloStart.race", { count: picked.length }) : t("soloStart.solo")}
              </Button>
              <Button variant="secondary" size="lg" onClick={onBack} disabled={busy}>{t("soloStart.back")}</Button>
            </div>
            {onLive && (
              <button type="button" data-testid="start-live" onClick={onLive} disabled={busy} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 text-sm font-semibold text-brand-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50">
                <Swords className="size-4" aria-hidden="true" />
                {t("soloStart.live")}
              </button>
            )}
          </div>
        ) : (
          <>
            {held ? (
              <p className="mt-4 text-sm text-muted" role="status">{t("soloStart.ready")}</p>
            ) : (
              <>
                <p className="mt-4 font-display text-6xl leading-none font-bold text-brand-600 tabular-nums" aria-hidden="true">{Math.max(1, left)}</p>
                <p className="mt-2 text-sm text-muted" role="status">{known ? t("soloStart.starting", { count: Math.max(1, left) }) : t("soloStart.gettingReady")}</p>
              </>
            )}
            <div className="mt-6 grid gap-3">
              <Button size="lg" onClick={onStart}>{t(held ? "soloStart.start" : "soloStart.startNow")}</Button>
              <Button variant="secondary" size="lg" onClick={onBack}>{t("soloStart.back")}</Button>
            </div>
            {onLive && (
              <button type="button" data-testid="start-live" onClick={onLive} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 text-sm font-semibold text-brand-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50">
                <Swords className="size-4" aria-hidden="true" />
                {t("soloStart.live")}
              </button>
            )}
            {/* Without Plus the offer is one line: it never stands between Play and the grid. */}
            {race && !race.plus && candidates.length > 0 && (
              <button
                type="button"
                data-testid="start-race-pitch"
                onClick={() => {
                  setHeld(true);
                  race.onPitch();
                }}
                className="mt-1 inline-flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold text-brand-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <PlusSeal size="1rem" />
                <span className="text-balance">{friends.length ? t("soloStart.pitchFriends", { name: friends[0].username, count: friends.length - 1 }) : t("soloStart.pitchPublic")}</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
