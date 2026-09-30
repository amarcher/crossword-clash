import { useTranslation } from "react-i18next";
import type { PuzzleClue } from "../../types/puzzle";

/** Desktop-only banner for the clue being solved; phones use MobileClueBar. */
export function ActiveClueCard({ clue }: { clue: PuzzleClue | null }) {
  const { t } = useTranslation();
  if (!clue) return null;
  return (
    <div className="hidden md:block shrink-0 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-600">
        {clue.number} {clue.direction === "across" ? t("cluePanel.across") : t("cluePanel.down")}
      </p>
      <p className="mt-0.5 text-lg font-medium leading-snug text-ink">{clue.text}</p>
    </div>
  );
}
