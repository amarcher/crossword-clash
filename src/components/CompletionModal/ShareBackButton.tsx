import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Reply } from "lucide-react";
import { buttonClass } from "../ui";
import { shareText } from "../../lib/shareSheet";
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
 * thread the link came from. The link is this solve's own and goes alone:
 * its preview plays how it was solved and a tap races it back. The sender also hears automatically (raceReplies.ts); this is the
 * reply in their own conversation.
 */
export function ShareBackButton({ name, link, outcome, darkMode }: ShareBackButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const send = async () => {
    const result = await shareText({ text: link, body: "", url: link, title: "Crossword Clash" }, await runtimeDeps());
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
