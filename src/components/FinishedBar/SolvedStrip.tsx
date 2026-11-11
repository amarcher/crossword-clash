import { useTranslation } from "react-i18next";
import { CircleCheck, RotateCcw } from "lucide-react";
import { buttonClass } from "../ui";

interface SolvedStripProps {
  /** Asks (the caller confirms) to empty the grid and solve the puzzle again. */
  onSolveAgain: () => void;
}

/**
 * The second row of a solved solo puzzle's header: says in words that the
 * filled grid is the solver's own finished puzzle, and carries the one way
 * back to an empty grid. A solved puzzle used to reopen empty, which read as
 * "not solved yet" (Andrew, 2026-11-10); now it stays filled until this
 * button, which the screen confirms before it clears anything.
 */
export function SolvedStrip({ onSolveAgain }: SolvedStripProps) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="solved-strip"
      className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-gold-50 px-3 py-1.5 ring-1 ring-gold-100"
    >
      <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gold-700">
        <CircleCheck className="size-4.5 shrink-0 text-gold-500" aria-hidden="true" />
        <span className="truncate">{t("playing.solvedNotice")}</span>
      </p>
      <button type="button" onClick={onSolveAgain} className={buttonClass("secondary", "sm", "min-h-11 shrink-0 md:min-h-9")}>
        <RotateCcw className="size-4" aria-hidden="true" />
        {t("playing.solveAgain")}
      </button>
    </div>
  );
}
