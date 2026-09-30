import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import { buttonClass } from "../ui";
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
    // "challenge_result" reads clearer than "rematch" as a funnel dimension —
    // it names where the live bridge was taken from.
    track("live_bridge", {
      mode: "live",
      from: intent === "rematch" ? "challenge_result" : "solo",
      size,
    });
    onPlayLive();
  }, [onPlayLive, intent, size]);

  return (
    <button
      type="button"
      onClick={handleClick}
      title={t("challenge.playLiveHint")}
      className={buttonClass(darkMode ? "stage" : "secondary", "md", "w-full")}
    >
      <Zap className="size-4 text-brand-600" aria-hidden="true" />
      <span>
        {intent === "rematch"
          ? t("challenge.rematchLive")
          : t("challenge.playLive")}
      </span>
      <span className="sr-only">
        {t("challenge.playLiveHint")}
      </span>
    </button>
  );
}
