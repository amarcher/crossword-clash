import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Swords } from "lucide-react";
import { buttonClass } from "../ui";
import { track } from "../../lib/analytics";
import { formatDuration } from "../../lib/soloStats";
import { buildChallengeUrl } from "../../lib/challenge";
import { SHARE_URL } from "../../lib/resultCard";
import { savePlayerName } from "../../lib/playerName";
import type { Puzzle } from "../../types/puzzle";

interface ChallengeFriendButtonProps {
  puzzle: Puzzle;
  /** The finisher's name if they have one, embedded as the challenger. */
  challengerName: string;
  /** The finisher's time in whole seconds — the ghost to beat. */
  finishSeconds: number;
  /**
   * Fired when the finisher types a name to sign the challenge — lets the
   * screen reuse it (e.g. claim the daily-leaderboard entry with it too).
   */
  onNameSigned?: (name: string) => void;
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
  onNameSigned,
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
        const typedName = rawName.trim();
        // A freshly signed name is worth keeping: persist it for future
        // sessions and let the screen apply it elsewhere (daily leaderboard).
        if (!hasRealName && typedName) {
          savePlayerName(typedName);
          onNameSigned?.(typedName);
        }
        const finalName = typedName || t("challenge.unsignedName");
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
    [busy, puzzle, finishSeconds, hasRealName, onNameSigned, t, flash],
  );

  const handlePrimary = useCallback(() => {
    if (hasRealName) doShare(presetName);
    else setSigning(true);
  }, [hasRealName, presetName, doShare]);

  const btnClass = buttonClass(darkMode ? "stage" : "secondary", "md", "w-full");

  if (signing) {
    return (
      <div className="col-span-2 flex flex-col gap-2">
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
          className={`h-11 w-full rounded-xl border px-4 text-center text-base font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${
            darkMode
              ? "bg-white/5 border-stage-line text-white placeholder:text-white/40"
              : "bg-surface border-line-strong text-ink placeholder:text-subtle"
          }`}
        />
        <button onClick={() => doShare(name)} disabled={busy} className={btnClass}>
          {toast ?? (busy ? t("challenge.sharing") : t("challenge.send"))}
        </button>
      </div>
    );
  }

  return (
    <button onClick={handlePrimary} disabled={busy} className={btnClass}>
      {!toast && !busy && <Swords className="size-4" aria-hidden="true" />}
      {toast ?? (busy ? t("challenge.sharing") : t("challenge.challengeFriend"))}
    </button>
  );
}
