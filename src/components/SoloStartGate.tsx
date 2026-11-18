import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Button } from "./ui";

/** Seconds counted down before a fresh puzzle starts on its own. */
export const START_COUNTDOWN_SECONDS = 3;

/**
 * The start of a fresh puzzle (Andrew, 2026-11-18): the grid is on screen,
 * blurred, behind a card that counts 3-2-1 and then starts the clock, so no
 * clock time is spent before the grid can be read. "Start now" skips the
 * count; "Go back" leaves with nothing started.
 */
export function SoloStartGate({ title, detail, onStart, onBack }: { title: string; detail?: string; onStart: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onBack);
  const [left, setLeft] = useState(START_COUNTDOWN_SECONDS);
  const start = useRef(onStart);
  start.current = onStart;
  useEffect(() => {
    if (left <= 0) {
      start.current();
      return;
    }
    const timer = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);
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
      <div className="w-full max-w-xs rounded-3xl border border-line bg-surface p-6 text-center shadow-overlay">
        <h1 id="solo-start-title" className="font-display text-2xl font-bold break-words text-ink">{title}</h1>
        {detail && <p className="mt-1 text-sm text-muted">{detail}</p>}
        <p className="mt-4 font-display text-6xl leading-none font-bold text-brand-600 tabular-nums" aria-hidden="true">{Math.max(1, left)}</p>
        <p className="mt-2 text-sm text-muted" role="status">{t("soloStart.starting", { count: Math.max(1, left) })}</p>
        <div className="mt-6 grid gap-3">
          <Button size="lg" onClick={onStart}>{t("soloStart.startNow")}</Button>
          <Button variant="secondary" size="lg" onClick={onBack}>{t("soloStart.back")}</Button>
        </div>
      </div>
    </div>
  );
}
