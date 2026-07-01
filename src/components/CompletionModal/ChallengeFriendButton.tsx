import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { track } from "../../lib/analytics";
import { formatDuration } from "../../lib/soloStats";
import { buildChallengeUrl } from "../../lib/challenge";
import { SHARE_URL } from "../../lib/resultCard";
import type { Puzzle } from "../../types/puzzle";

interface ChallengeFriendButtonProps {
  puzzle: Puzzle;
  /** The finisher's name, embedded as the challenger. */
  challengerName: string;
  /** The finisher's time in whole seconds — the ghost to beat. */
  finishSeconds: number;
  darkMode?: boolean;
}

/**
 * Turns the just-finished solo solve into a self-contained challenge link and
 * shares/copies it. The link carries the puzzle + the finisher's name and time,
 * so a friend can race the ghost with no server round-trip.
 */
export function ChallengeFriendButton({
  puzzle,
  challengerName,
  finishSeconds,
  darkMode,
}: ChallengeFriendButtonProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const seconds = Math.max(0, Math.floor(finishSeconds));
      const url = buildChallengeUrl(SHARE_URL, puzzle, { name: challengerName, seconds });
      track("challenge_created", {
        size: `${puzzle.width}x${puzzle.height}`,
        target_seconds: seconds,
      });
      const caption = t("challenge.shareCaption", { time: formatDuration(seconds), url });

      const nav = typeof navigator !== "undefined" ? navigator : undefined;
      if (typeof nav?.share === "function") {
        try {
          await nav.share({ text: caption, url });
          return;
        } catch (err) {
          // Dismissed share sheet — nothing shared, not an error.
          if ((err as DOMException)?.name === "AbortError") return;
          // Real failure → fall through to clipboard.
        }
      }
      if (typeof nav?.clipboard?.writeText === "function") {
        await nav.clipboard.writeText(url);
        flash(t("challenge.linkCopied"));
      }
    } catch {
      // Sharing must never break the completion screen.
    } finally {
      setBusy(false);
    }
  }, [busy, puzzle, challengerName, finishSeconds, t, flash]);

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-70 ${
        darkMode
          ? "text-white bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-offset-neutral-800"
          : "text-white bg-emerald-600 hover:bg-emerald-700"
      }`}
    >
      {toast ?? (busy ? t("challenge.sharing") : t("challenge.challengeFriend"))}
    </button>
  );
}
