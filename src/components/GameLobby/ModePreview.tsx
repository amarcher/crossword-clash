import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getPlayerColor } from "../../lib/playerColors";
import {
  modePreviewFrame,
  PREVIEW_CELLS,
  PREVIEW_SIZE,
  PREVIEW_STILL,
  type PreviewMode,
} from "../../lib/modePreview";

/** One square of the loop, in ms. */
const STEP_MS = 420;
const YOU = getPlayerColor(0);
const FRIEND = getPlayerColor(1);
/** The real grid's player tint (Cell.tsx): the colour at 18% over white. */
const tint = (hex: string) => `color-mix(in srgb, ${hex} 18%, white)`;

interface ModePreviewProps {
  mode: PreviewMode;
  /** The mode's one-line description: the picture's accessible name. */
  label: string;
  variant?: "light" | "dark";
}

/**
 * A small looping board showing how a mode plays (Andrew, 2026-11-15: say what
 * each mode is by showing the board filling in). Decorative motion: one still
 * frame under reduced motion.
 */
export function ModePreview({ mode, label, variant = "light" }: ModePreviewProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(PREVIEW_STILL);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let s = 0;
    // The first tick starts the loop from an empty board.
    const id = window.setInterval(() => {
      setStep(s);
      s += 1;
    }, STEP_MS);
    return () => {
      window.clearInterval(id);
      setStep(PREVIEW_STILL);
    };
  }, [mode]);

  const frame = modePreviewFrame(mode, step);
  const isDark = variant === "dark";
  const text = isDark ? "text-slate-300" : "text-ink-soft";
  const quiet = isDark ? "text-slate-400" : "text-muted";
  const shared = mode === "versus" || mode === "coop";

  const row = (color: string, name: string, value: string) => (
    <li className="flex items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className={`min-w-0 flex-1 truncate font-semibold ${text}`}>{name}</span>
      <span className={`tabular-nums ${quiet}`}>{value}</span>
    </li>
  );

  const you = t("modePreview.you");
  const friend = t("modePreview.friend");
  const solving = t("completion.solving");

  return (
    <div role="img" aria-label={label} data-testid="mode-preview" data-mode={mode} className="flex items-center gap-4">
      <div
        aria-hidden="true"
        className="grid shrink-0 gap-px rounded-md bg-ink p-px"
        style={{ gridTemplateColumns: `repeat(${PREVIEW_SIZE}, 1.5rem)` }}
      >
        {frame.cells.map((cell, i) => (
          <span
            key={i}
            className="relative grid size-6 place-items-center text-xs font-bold leading-none text-ink"
            style={{
              backgroundColor: cell.by === null ? "white" : shared ? tint(cell.by === 0 ? YOU : FRIEND) : "white",
            }}
          >
            {cell.by !== null && cell.letter}
            {cell.dot && (
              <span className="absolute right-0.5 bottom-0.5 size-1.5 rounded-full opacity-70" style={{ backgroundColor: FRIEND }} />
            )}
          </span>
        ))}
      </div>
      <ul aria-hidden="true" className="grid min-w-0 flex-1 gap-1.5 text-xs">
        {mode === "coop" ? (
          <>
            {row(YOU, you, "")}
            {row(FRIEND, friend, "")}
            <li className={`font-semibold ${text}`}>
              {t("modePreview.together", { count: frame.counts[0] + frame.counts[1], total: PREVIEW_CELLS })}
            </li>
          </>
        ) : mode === "versus" ? (
          <>
            {row(YOU, you, String(frame.counts[0]))}
            {row(FRIEND, friend, String(frame.counts[1]))}
          </>
        ) : (
          <>
            {row(YOU, you, frame.done ? t("modePreview.done") : solving)}
            {row(
              FRIEND,
              mode === "ghost" ? t("modePreview.earlierSolve", { name: friend }) : friend,
              `${Math.round((frame.counts[1] / PREVIEW_CELLS) * 100)}%`,
            )}
          </>
        )}
      </ul>
    </div>
  );
}
