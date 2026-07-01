import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { track } from "../../lib/analytics";
import { formatDuration } from "../../lib/soloStats";
import { buildChallengeUrl } from "../../lib/challenge";
import { SHARE_URL } from "../../lib/resultCard";
import type { Puzzle } from "../../types/puzzle";

interface ChallengeFriendButtonProps {
  puzzle: Puzzle;
  /** The finisher's name if they have one, embedded as the challenger. */
  challengerName: string;
  /** The finisher's time in whole seconds — the ghost to beat. */
  finishSeconds: number;
  darkMode?: boolean;
}

/**
 * Turns the just-finished solo solve into a self-contained challenge link and
 * shares/copies it. The link carries the puzzle + the challenger's name and
 * time, so a friend can race the ghost with no server round-trip.
 *
 * The challenger's NAME is the viral hook, and solo finishers usually have no
 * display name — so when there's no real name we prompt them to sign the
 * challenge inline (falling back to a warm "A friend", never the generic
 * "Player"). When a real name already exists, sharing is one tap.
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
  const [signing, setSigning] = useState(false);

  const defaultName = t("common.defaultPlayerName");
  const presetName = challengerName.trim();
  const hasRealName = presetName !== "" && presetName !== defaultName;
  const [name, setName] = useState(hasRealName ? presetName : "");

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const doShare = useCallback(
    async (rawName: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const finalName = rawName.trim() || t("challenge.unsignedName");
        const seconds = Math.max(0, Math.floor(finishSeconds));
        const url = buildChallengeUrl(SHARE_URL, puzzle, { name: finalName, seconds });
        track("challenge_created", {
          size: `${puzzle.width}x${puzzle.height}`,
          target_seconds: seconds,
        });
        const caption = t("challenge.shareCaption", {
          title: puzzle.title || "crossword",
          time: formatDuration(seconds),
          url,
        });

        const nav = typeof navigator !== "undefined" ? navigator : undefined;
        if (typeof nav?.share === "function") {
          try {
            await nav.share({ text: caption, url });
            setSigning(false);
            return;
          } catch (err) {
            if ((err as DOMException)?.name === "AbortError") return;
            // Real failure → fall through to clipboard.
          }
        }
        if (typeof nav?.clipboard?.writeText === "function") {
          await nav.clipboard.writeText(url);
          flash(t("challenge.linkCopied"));
          setSigning(false);
        }
      } catch {
        // Sharing must never break the completion screen.
      } finally {
        setBusy(false);
      }
    },
    [busy, puzzle, finishSeconds, t, flash],
  );

  const handlePrimary = useCallback(() => {
    if (hasRealName) doShare(presetName);
    else setSigning(true);
  }, [hasRealName, presetName, doShare]);

  const buttonClass = `w-full px-6 py-3 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-70 ${
    darkMode
      ? "text-white bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-offset-neutral-800"
      : "text-white bg-emerald-600 hover:bg-emerald-700"
  }`;

  if (signing) {
    return (
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") doShare(name);
          }}
          placeholder={t("challenge.signPlaceholder")}
          aria-label={t("challenge.signPlaceholder")}
          autoFocus
          maxLength={24}
          className={`w-full px-4 py-3 rounded-lg border text-center font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
            darkMode
              ? "bg-neutral-700 border-neutral-600 text-white placeholder:text-neutral-400"
              : "bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400"
          }`}
        />
        <button onClick={() => doShare(name)} disabled={busy} className={buttonClass}>
          {toast ?? (busy ? t("challenge.sharing") : t("challenge.send"))}
        </button>
      </div>
    );
  }

  return (
    <button onClick={handlePrimary} disabled={busy} className={buttonClass}>
      {toast ?? (busy ? t("challenge.sharing") : t("challenge.challengeFriend"))}
    </button>
  );
}
