import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDuration } from "../../lib/soloStats";

interface SoloTimerProps {
  /** Pulls the live elapsed seconds (stable identity from useSoloTimer). */
  getElapsedSeconds: () => number;
  /** Whether the clock is ticking; when false the value is shown frozen. */
  running: boolean;
  className?: string;
}

/**
 * The visible solo clock. It owns a tiny per-second state of its own so that
 * ticking re-renders ONLY this label — never the grid or the rest of the
 * playing screen.
 */
export function SoloTimer({ getElapsedSeconds, running, className }: SoloTimerProps) {
  const { t } = useTranslation();
  const [seconds, setSeconds] = useState(() => getElapsedSeconds());

  useEffect(() => {
    setSeconds(getElapsedSeconds());
    if (!running) return;
    const id = window.setInterval(() => setSeconds(getElapsedSeconds()), 1000);
    return () => window.clearInterval(id);
  }, [running, getElapsedSeconds]);

  return (
    <span
      role="timer"
      aria-label={t("soloStats.timerLabel")}
      className={`inline-flex items-center gap-1 tabular-nums font-mono text-sm text-neutral-600 ${className ?? ""}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-3.5 h-3.5 text-neutral-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5" />
        <path d="M9 2h6" />
      </svg>
      {formatDuration(seconds)}
    </span>
  );
}
