import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Puzzle } from "../types/puzzle";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Button, MiniGridThumb } from "./ui";

/**
 * A room's start: the count every player (and the TV) watches before the grid, as a solo
 * puzzle's start card counts (SoloStartGate). The grid's shape is behind it, blurred, where the
 * grid will be. The host can call it off ("Go back") and everyone returns to the room; nobody
 * else has a button, the count is the host's.
 */
export function RoomStartGate({ puzzle, detail, startsAtMs, onCancel, tv = false }: {
  puzzle: Puzzle;
  detail?: string;
  startsAtMs: number;
  onCancel?: () => void;
  tv?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onCancel);
  const left = () => Math.max(1, Math.ceil((startsAtMs - Date.now()) / 1000));
  const [count, setCount] = useState(left);
  useEffect(() => {
    setCount(left());
    const timer = window.setInterval(() => setCount(left()), 200);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `left` reads the one dependency
  }, [startsAtMs]);

  return (
    <div className={`fixed inset-0 z-40 grid place-items-center overflow-hidden ${tv ? "bg-stage" : "bg-canvas"}`}>
      <MiniGridThumb puzzle={puzzle} className="w-[min(92vw,80dvh)] blur-lg" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-start-title"
        data-testid="room-start-gate"
        className={`absolute inset-0 z-10 flex items-center justify-center p-6 ${tv ? "bg-stage/50" : "bg-canvas/50"}`}
        style={{ paddingTop: "max(24px, env(safe-area-inset-top))", paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
      >
        <div
          className="w-full max-w-xs rounded-3xl border border-line bg-surface p-6 text-center shadow-overlay"
          style={tv ? { maxWidth: "max(20rem, calc(var(--u) * 30))", padding: "calc(var(--u) * 2.4)" } : undefined}
        >
          <h1 id="room-start-title" className={`font-display font-bold break-words text-ink ${tv ? "tv-t-2xl" : "text-2xl"}`}>{puzzle.title}</h1>
          {detail && <p className={`mt-1 text-muted ${tv ? "tv-t-md" : "text-sm"}`}>{detail}</p>}
          <p
            className="mt-4 font-display text-6xl leading-none font-bold tabular-nums text-brand-600"
            style={tv ? { fontSize: "max(3.75rem, calc(var(--u) * 9))" } : undefined}
            aria-hidden="true"
          >
            {count}
          </p>
          {/* The numeral says it; the sentence is for a screen reader. */}
          <p className="sr-only" role="status">{t("soloStart.starting", { count })}</p>
          {onCancel && (
            <Button variant="secondary" size="lg" className={`mt-6 w-full ${tv ? "tv-t-lg h-auto! min-h-14 py-4" : ""}`} onClick={onCancel}>
              {t("soloStart.back")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
