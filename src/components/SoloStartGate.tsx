import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Loader2 } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { formatDuration } from "../lib/soloStats";
import { MAX_GHOSTS, type RaceCandidate } from "../lib/race";
import { Button } from "./ui";

/** Seconds counted down before a fresh puzzle starts on its own. */
export const START_COUNTDOWN_SECONDS = 3;
/** How long the gate waits to learn whether anyone's solve can be raced before counting down without them. */
export const RACE_OFFER_WAIT_MS = 1200;

/** The solves of this puzzle that can run beside the player's own (race.ts). */
export interface StartGateRace {
  /** False while the list is still being read. */
  ready: boolean;
  candidates: RaceCandidate[];
  /** Ids ticked on arrival (a Race tap on a leaderboard row): the card opens on the list. */
  preselect: string[];
  /** Load the picked solves so they start with the clock; false when none could be loaded. */
  onPick: (userIds: string[]) => Promise<boolean>;
}

/** A live room with friends who have not solved the puzzle yet. */
export interface StartGateLive {
  /** Friends who have not solved it, for the row's line; none still offers a room to share by code. */
  names: string[];
  /** Create the room and leave for its lobby; resolves once this card can be let go. */
  onChoose: () => void | Promise<void>;
}

interface SoloStartGateProps {
  title: string;
  detail?: string;
  race?: StartGateRace;
  live?: StartGateLive;
  /** How to play was already answered (Play solo now, from Race friends): count at once. */
  answered?: boolean;
  onStart: () => void;
  onBack: () => void;
}

/** "a", "a and b", "a, b and 2 more": who a row is about, short enough for one line. */
function nameList(t: (key: string, o?: Record<string, unknown>) => string, names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return t("soloStart.two", { a: names[0], b: names[1] });
  return t("soloStart.more", { a: names[0], b: names[1], count: names.length - 2 });
}

/**
 * The start of a fresh puzzle: one Play button everywhere, and this card asks
 * how to play (Andrew, 2026-11-19). The grid is on screen, blurred, behind
 * it. With someone to race, the card offers Play solo, a finished solve to
 * race (friends first, up to MAX_GHOSTS, picked from a list) and a live room
 * (its lobby is where friends are invited; without friends it is a room to
 * share by code). Then it counts 3-2-1 and starts the clock: the countdown is
 * always the last thing before the grid, and no clock time is spent choosing.
 * Where no room can be made (no backend) and nobody's solve can be raced,
 * the card is the countdown alone. "Start now" skips the count; "Go back" leaves with
 * nothing started.
 */
export function SoloStartGate({ title, detail, race, live, answered, onStart, onBack }: SoloStartGateProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onBack);

  // Whether there is anyone to offer is known once the list answers, or after a short wait.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), RACE_OFFER_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const known = answered || !race || race.ready || waited;
  const candidates = race?.ready ? race.candidates : [];
  const friends = candidates.filter((c) => c.friend);

  // "ask": how to play. "pick": which finished solves. "count": 3-2-1.
  const [step, setStep] = useState<"ask" | "pick" | "count" | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  // Decided once, when the wait ends: a list that answers after the count is running does not pull the card back.
  useEffect(() => {
    if (!known || step) return;
    const ticked = race?.ready ? race.preselect.filter((id) => race.candidates.some((c) => c.userId === id)).slice(0, MAX_GHOSTS) : [];
    setPicked(ticked);
    setStep(answered ? "count" : ticked.length > 0 ? "pick" : candidates.length > 0 || live ? "ask" : "count");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decided at the moment the wait ends
  }, [known]);
  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : now.length < MAX_GHOSTS ? [...now, id] : now));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [racing, setRacing] = useState<string[]>([]);
  const confirm = async () => {
    if (!race || busy || picked.length === 0) return;
    setBusy(true);
    setFailed(false);
    const ok = await race.onPick(picked);
    setBusy(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setRacing(picked.map((id) => candidates.find((c) => c.userId === id)?.username ?? "").filter(Boolean));
    setStep("count");
  };

  const [opening, setOpening] = useState(false);
  const openLive = async () => {
    if (!live || opening) return;
    setOpening(true);
    try {
      await live.onChoose();
    } finally {
      setOpening(false);
    }
  };

  const counting = step === "count";
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

  const option = "flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

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
      <div className={`w-full rounded-3xl border border-line bg-surface p-6 text-center shadow-overlay ${step === "ask" || step === "pick" ? "max-w-sm" : "max-w-xs"}`}>
        <h1 id="solo-start-title" className="font-display text-2xl font-bold break-words text-ink">{title}</h1>

        {step === "ask" ? (
          <div data-testid="start-ask">
            <p className="mt-1 text-sm text-muted">{t("soloStart.ask")}</p>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2.5">
              <button type="button" onClick={() => setStep("count")} className={`${option} border-brand-600 bg-brand-600 text-white hover:bg-brand-700`}>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t("soloStart.solo")}</span>
                </span>
              </button>
              {candidates.length > 0 && (
                <button type="button" data-testid="start-ask-race" onClick={() => setStep("pick")} className={`${option} border-line-strong bg-surface text-ink hover:bg-surface-sunken`}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t("soloStart.raceSolve")}</span>
                    <span className="block truncate text-sm text-muted">
                      {friends.length ? nameList(t, friends.map((c) => c.username)) : t("soloStart.fastest")}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
                </button>
              )}
              {live && (
                <button type="button" data-testid="start-ask-live" disabled={opening} aria-busy={opening || undefined} onClick={() => void openLive()} className={`${option} border-line-strong bg-surface text-ink hover:bg-surface-sunken`}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t("soloStart.live")}</span>
                    {live.names.length > 0 && (
                      <span className="block truncate text-sm text-muted">
                        {nameList(t, live.names)}
                      </span>
                    )}
                  </span>
                  {opening ? <Loader2 className="size-5 shrink-0 animate-spin text-muted motion-reduce:animate-none" aria-hidden="true" /> : <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />}
                </button>
              )}
            </div>
            <Button variant="ghost" size="lg" className="mt-3 w-full" onClick={onBack}>{t("soloStart.back")}</Button>
          </div>
        ) : step === "pick" ? (
          <div data-testid="start-race-pick" className="mt-1">
            <p className="text-sm font-semibold text-ink">{t("soloStart.raceSolve")}</p>
            <p className="mt-0.5 text-xs text-muted">{t("soloStart.pickBody", { max: MAX_GHOSTS })}</p>
            <ul className="mt-3 flex max-h-[min(13.75rem,38dvh)] flex-col overflow-y-auto rounded-xl border border-line text-left">
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
              <Button size="lg" onClick={() => void confirm()} disabled={busy || picked.length === 0} aria-busy={busy || undefined}>
                {busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {picked.length > 0 ? t("soloStart.race", { count: picked.length }) : t("soloStart.pickOne")}
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setStep("ask")} disabled={busy}>{t("soloStart.back")}</Button>
            </div>
          </div>
        ) : (
          <>
            {racing.length > 0 ? (
              <p className="mt-1 truncate text-sm text-muted">{t("soloStart.racing", { names: nameList(t, racing), count: racing.length })}</p>
            ) : (
              detail && <p className="mt-1 text-sm text-muted">{detail}</p>
            )}
            <p className={`mt-4 font-display text-6xl leading-none font-bold tabular-nums ${step ? "text-brand-600" : "text-line-strong"}`} aria-hidden="true">{Math.max(1, left)}</p>
            {/* The numeral says it; the sentence is for a screen reader. */}
            <p className="sr-only" role="status">{step ? t("soloStart.starting", { count: Math.max(1, left) }) : t("soloStart.gettingReady")}</p>
            <div className="mt-6 grid gap-3">
              <Button size="lg" onClick={onStart}>{t("soloStart.startNow")}</Button>
              <Button variant="secondary" size="lg" onClick={onBack}>{t("soloStart.back")}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
