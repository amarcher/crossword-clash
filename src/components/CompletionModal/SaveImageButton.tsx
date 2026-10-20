import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageDown } from "lucide-react";
import { buttonClass } from "../ui";
import { track } from "../../lib/analytics";
import { formatDuration } from "../../lib/soloStats";
import { buildResultFilename, composeCardText, type ResultCardInput } from "../../lib/resultCard";
import { canvasToBlob, drawCard, triggerDownload } from "../../lib/resultCardCanvas";

interface SaveImageButtonProps extends ResultCardInput {
  darkMode?: boolean;
}

/**
 * "Save image" — the secondary action that keeps the canvas result card. On a
 * phone browser the PNG goes through the share sheet (that is how it reaches
 * Photos); elsewhere it downloads. The text block, not this card, is what
 * "Share" sends.
 */
export function SaveImageButton(props: SaveImageButtonProps) {
  const { darkMode, ...input } = props;
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const handleSave = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const card = composeCardText(input, {
        tag: t("completion.shareTag"),
        heading: t("completion.cardHeading"),
        newBest: t("soloStats.newBest"),
        best: input.bestSeconds !== undefined ? t("soloStats.bestTime", { time: formatDuration(input.bestSeconds) }) : "",
        winner: t("completion.wins", { name: input.winnerName ?? "" }),
        tie: t("completion.tie"),
        coop: t("completion.coopSolved"),
        standing: input.viewerStanding
          ? t(
              input.viewerStanding.won
                ? "completion.cardStandingWin"
                : input.viewerStanding.tiedForFirst
                  ? "completion.cardStandingTie"
                  : "completion.cardStandingRank",
              { rank: input.viewerStanding.rank, total: input.viewerStanding.total },
            )
          : undefined,
      });
      const filename = buildResultFilename(input.puzzleTitle);
      const blob = await canvasToBlob(drawCard(card));
      if (!blob) return;

      const nav = typeof navigator !== "undefined" ? navigator : undefined;
      const file = typeof File !== "undefined" ? new File([blob], filename, { type: "image/png" }) : null;
      if (file && typeof nav?.share === "function" && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file] });
          track("result_shared", { mode: input.mode, method: "image" });
          return;
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") return;
          // Fall through to a download.
        }
      }
      triggerDownload(blob, filename);
      flash(t("completion.imageSaved"));
      track("result_shared", { mode: input.mode, method: "download" });
    } catch {
      // Saving must never break the completion screen.
    } finally {
      setBusy(false);
    }
  }, [busy, input, t, flash]);

  return (
    <button onClick={handleSave} disabled={busy} className={buttonClass(darkMode ? "stage" : "secondary", "md", "w-full")}>
      {!toast && <ImageDown className="size-4" aria-hidden="true" />}
      {toast ?? t("completion.saveImage")}
    </button>
  );
}
