import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { track } from "../../lib/analytics";
import { formatDuration } from "../../lib/soloStats";
import {
  SHARE_URL,
  buildResultFilename,
  composeCardText,
  selectShareMethod,
  type ResultCardInput,
  type ResultCardText,
  type ShareMethod,
} from "../../lib/resultCard";

interface ShareResultButtonProps extends ResultCardInput {
  darkMode?: boolean;
}

const CARD_W = 1200;
const CARD_H = 630;

/** Draw the result card onto a canvas. Impure DOM glue over the pure layout. */
function drawCard(card: ResultCardText): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Background — deep indigo gradient.
  const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  grad.addColorStop(0, "#1e1b4b");
  grad.addColorStop(1, "#312e81");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.textAlign = "center";
  const cx = CARD_W / 2;

  // Trophy + heading.
  ctx.font = "96px serif";
  ctx.fillText("🏆", cx, 190);

  ctx.fillStyle = "#a5b4fc";
  ctx.font = "600 44px system-ui, sans-serif";
  ctx.fillText(card.heading, cx, 270);

  // Puzzle title (truncated to fit).
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 56px system-ui, sans-serif";
  ctx.fillText(fit(ctx, card.title, CARD_W - 160), cx, 360);

  // Headline metric (finish time / outcome).
  if (card.metric) {
    ctx.fillStyle = "#fde68a";
    ctx.font = "800 100px system-ui, sans-serif";
    ctx.fillText(fit(ctx, card.metric, CARD_W - 120), cx, 470);
  }

  // Optional detail.
  if (card.detail) {
    ctx.fillStyle = "#c7d2fe";
    ctx.font = "500 40px system-ui, sans-serif";
    ctx.fillText(card.detail, cx, 535);
  }

  // Brand tag.
  ctx.fillStyle = "#818cf8";
  ctx.font = "600 36px system-ui, sans-serif";
  ctx.fillText(card.tag, cx, 595);

  return canvas;
}

/** Truncate text with an ellipsis so it fits within maxWidth. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + "…";
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer the revoke: revoking synchronously after click() aborts the download
  // in Safari/Firefox (the browser hasn't finished reading the blob yet).
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ShareResultButton(props: ShareResultButtonProps) {
  const { darkMode, ...input } = props;
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const buildCaption = useCallback((): string => {
    const title = (input.puzzleTitle ?? "").trim() || "Crossword";
    if (input.mode === "multiplayer") {
      const standing = input.viewerStanding;
      if (standing) {
        const vars = { title, rank: standing.rank, total: standing.total, url: SHARE_URL };
        if (standing.won) return t("completion.shareCaptionStandingWin", vars);
        if (standing.tiedForFirst) return t("completion.shareCaptionStandingTie", vars);
        return t("completion.shareCaptionStandingRank", vars);
      }
      return input.isTie
        ? t("completion.shareCaptionTie", { title, url: SHARE_URL })
        : t("completion.shareCaptionWin", {
            name: input.winnerName ?? "",
            title,
            url: SHARE_URL,
          });
    }
    return input.finishSeconds !== undefined
      ? t("completion.shareCaptionSolo", {
          title,
          time: formatDuration(input.finishSeconds),
          url: SHARE_URL,
        })
      : t("completion.shareCaptionSoloNoTime", { title, url: SHARE_URL });
  }, [input, t]);

  const handleShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const report = (method: ShareMethod) =>
      track("result_shared", { mode: input.mode, method });
    try {
      const card = composeCardText(input, {
        tag: t("completion.shareTag"),
        heading: t("completion.cardHeading"),
        newBest: t("soloStats.newBest"),
        best:
          input.bestSeconds !== undefined
            ? t("soloStats.bestTime", { time: formatDuration(input.bestSeconds) })
            : "",
        winner: t("completion.wins", { name: input.winnerName ?? "" }),
        tie: t("completion.tie"),
        standing: input.viewerStanding
          ? t(
              input.viewerStanding.won
                ? "completion.cardStandingWin"
                : input.viewerStanding.tiedForFirst
                  ? "completion.cardStandingTie"
                  : "completion.cardStandingRank",
              {
                rank: input.viewerStanding.rank,
                total: input.viewerStanding.total,
              },
            )
          : undefined,
      });
      const caption = buildCaption();
      const filename = buildResultFilename(input.puzzleTitle);
      const blob = await canvasToBlob(drawCard(card));

      const file =
        blob &&
        typeof File !== "undefined" &&
        new File([blob], filename, { type: "image/png" });

      const nav = typeof navigator !== "undefined" ? navigator : undefined;
      const canShareFiles = Boolean(
        file &&
          nav?.canShare?.({ files: [file] }) &&
          typeof nav?.share === "function",
      );
      const canCopy = typeof nav?.clipboard?.writeText === "function";
      const method = selectShareMethod({ canShareFiles, canCopy });

      if (method === "webshare" && file) {
        try {
          await nav!.share({ files: [file], text: caption, url: SHARE_URL });
          report("webshare");
        } catch (err) {
          // User dismissed the share sheet — not an error, nothing shared.
          if ((err as DOMException)?.name === "AbortError") return;
          // Real failure → fall back to a download so the user still gets the card.
          if (blob) {
            triggerDownload(blob, filename);
            flash(t("completion.imageSaved"));
            report("download");
          }
        }
        return;
      }

      // Desktop fallback: copy the link AND offer the PNG download.
      if (blob) triggerDownload(blob, filename);
      if (method === "copy") {
        try {
          await nav!.clipboard.writeText(caption);
          flash(t("completion.linkCopied"));
          report("copy");
          return;
        } catch {
          // Clipboard blocked — the download already happened.
        }
      }
      if (blob) flash(t("completion.imageSaved"));
      report("download");
    } catch {
      // Sharing must never break the completion screen.
    } finally {
      setBusy(false);
    }
  }, [busy, input, t, buildCaption, flash]);

  return (
    <button
      onClick={handleShare}
      disabled={busy}
      className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-70 ${
        darkMode
          ? "text-white bg-indigo-600 hover:bg-indigo-500 focus-visible:ring-offset-neutral-800"
          : "text-white bg-indigo-600 hover:bg-indigo-700"
      }`}
    >
      {toast ?? (busy ? t("completion.sharing") : `🔗 ${t("completion.share")}`)}
    </button>
  );
}
