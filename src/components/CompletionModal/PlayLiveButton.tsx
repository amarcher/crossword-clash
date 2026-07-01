import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { track } from "../../lib/analytics";

interface PlayLiveButtonProps {
  /**
   * Fires the live bridge: kick the finisher into the existing host-as-player
   * flow to host a FRESH puzzle. The parent owns state cleanup + navigation.
   */
  onPlayLive: () => void;
  /**
   * "rematch" after racing a friend's ghost (a named opponent to race live);
   * "solo" after a plain solo finish (an open invitation).
   */
  intent: "rematch" | "solo";
  /**
   * Puzzle size for the analytics dimension (e.g. "15x15"). Optional so the
   * button degrades safely if the puzzle is unknown.
   */
  size?: string;
  darkMode?: boolean;
}

/**
 * The "Play Live" bridge from an async challenge/solo result into a fair live
 * head-to-head. It never builds a room itself — it funnels into the existing
 * host-as-player multiplayer stack (name → import → lobby with share code / QR)
 * on a FRESH puzzle, so neither player has solved the new one.
 *
 * Rendered only when multiplayer is actually available; the parent gates that
 * by whether it passes `onPlayLive` at all.
 */
export function PlayLiveButton({
  onPlayLive,
  intent,
  size,
  darkMode,
}: PlayLiveButtonProps) {
  const { t } = useTranslation();

  const handleClick = useCallback(() => {
    // Distinct funnel event for the live bridge — deliberately NOT overloading
    // puzzle_imported / challenge_created. mode marks the origin of the bridge.
    track("live_bridge", { mode: "live", from: intent, size });
    onPlayLive();
  }, [onPlayLive, intent, size]);

  const ringOffset = darkMode
    ? "focus-visible:ring-offset-neutral-800"
    : "focus-visible:ring-offset-2";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        `group w-full px-6 py-3 rounded-lg font-semibold text-white transition-all ` +
        `bg-gradient-to-b from-violet-500 to-violet-600 hover:from-violet-500 hover:to-violet-700 ` +
        `shadow-md shadow-violet-600/25 hover:-translate-y-0.5 active:translate-y-0 ` +
        `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${ringOffset}`
      }
    >
      <span className="block leading-tight">
        {intent === "rematch"
          ? t("challenge.rematchLive")
          : t("challenge.playLive")}
      </span>
      <span className="block text-xs font-medium text-violet-50/90 mt-0.5">
        {t("challenge.playLiveHint")}
      </span>
    </button>
  );
}
