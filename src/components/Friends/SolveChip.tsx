import { useTranslation } from "react-i18next";
import { Check, Swords } from "lucide-react";
import { solveChip, type FriendSolve } from "../../lib/friends";

/**
 * "Solved" or "Raced it" beside a friend who already finished the puzzle an
 * invite is about (spec §3.8): a tinted chip, so the host knows before
 * inviting. Nothing for a friend with no finish on record.
 */
export function SolveChip({ solve, className = "" }: { solve: FriendSolve | undefined; className?: string }) {
  const { t } = useTranslation();
  const kind = solveChip(solve);
  if (!kind) return null;
  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold ${kind === "solved" ? "bg-emerald-50 text-emerald-800" : "bg-brand-50 text-brand-700"} ${className}`}
      title={t(kind === "solved" ? "friends.solvedChipTitle" : "friends.racedChipTitle")}
    >
      {kind === "solved" ? <Check className="size-3.5" aria-hidden="true" /> : <Swords className="size-3.5" aria-hidden="true" />}
      {t(kind === "solved" ? "friends.solvedChip" : "friends.racedChip")}
    </span>
  );
}
