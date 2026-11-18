import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Reply } from "lucide-react";
import { buttonClass } from "../ui";
import { shareText } from "../../lib/shareSheet";
import { formatDuration } from "../../lib/soloStats";
import { track } from "../../lib/analytics";
import type { ChallengeComparison } from "../../lib/challenge";
import { runtimeDeps } from "./ShareResultButton";

interface ShareBackButtonProps extends ChallengeComparison {
  /** The link's sender, just raced. */
  name: string;
  /** This solve's own daily link (its preview plays this solve; tapping it races it). */
  link: string;
  darkMode?: boolean;
}

/**
 * After racing a shared link's sender: "Send Andrew your solve", into the
 * thread the link came from. The reply line says how it went; the link is
 * this solve's own, so its preview plays how it was solved and a tap races it
 * back. The sender also hears automatically (raceReplies.ts); this is the
 * reply in their own conversation.
 */
export function ShareBackButton({ name, link, outcome, deltaSeconds, darkMode }: ShareBackButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const line =
    outcome === "beat"
      ? t("challenge.shareBackBeat", { name, delta: formatDuration(deltaSeconds) })
      : outcome === "lost"
        ? t("challenge.shareBackLost", { name, delta: formatDuration(deltaSeconds) })
        : t("challenge.shareBackTied", { name });
  const send = async () => {
    const text = `${line} ${link}`;
    const result = await shareText({ text, body: line, url: link, title: "Crossword Clash" }, await runtimeDeps());
    if (result.outcome === "dismissed") return;
    if (result.method === "copy") setCopied(true);
    track("race_share_back", { method: result.method, outcome: result.outcome, verdict: outcome });
  };
  return (
    <button type="button" onClick={() => void send()} className={buttonClass(darkMode ? "stage" : "soft", "lg", "w-full")} data-testid="share-back">
      <Reply className="size-5" aria-hidden="true" />
      {copied ? t("challenge.shareBackCopied", { name }) : t("challenge.shareBack", { name })}
    </button>
  );
}
