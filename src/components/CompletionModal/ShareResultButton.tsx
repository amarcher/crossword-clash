import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Share2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { buttonClass } from "../ui";
import { track } from "../../lib/analytics";
import { isRealPlayerName, savePlayerName } from "../../lib/playerName";
import { shareText, type ShareDeps } from "../../lib/shareSheet";
import type { ShareBlock } from "../../lib/shareBlock";
import type { ShareMode } from "../../lib/resultCard";

interface ShareResultButtonProps {
  mode: ShareMode;
  /**
   * The result block for a given challenger name. The link inside carries the
   * name, so the block is rebuilt when the finisher signs one.
   */
  blockFor: (name: string) => ShareBlock;
  /** The finisher's name as known; the anonymous default counts as none. */
  challengerName: string;
  /** Whether a ghost time rides in the link — only then is a name worth asking for. */
  hasTime: boolean;
  /** Puzzle size for the challenge analytics dimension. */
  puzzleSize?: string;
  /** True when the puzzle was today's daily: the button says "Share your time". */
  daily?: boolean;
  /** One line under the preview saying what the squares mean (the modal words it per mode). */
  legend?: string;
  /**
   * Fired when the finisher types a name to sign the share — lets the screen
   * reuse it (e.g. claim the daily-leaderboard entry with it too).
   */
  onNameSigned?: (name: string) => void;
  darkMode?: boolean;
}

/** A link as shown in the preview: no scheme, and a `#puzzle=` payload cut short (it is the whole puzzle). */
export function displayLink(url: string): string {
  const bare = url.replace(/^https?:\/\//, "");
  const payload = bare.indexOf("#puzzle=");
  return payload === -1 ? bare : `${bare.slice(0, payload + "#puzzle=".length + 6)}…`;
}

/** The share deps for this runtime: the Capacitor plugin in the app, the browser APIs on the web. */
async function runtimeDeps(): Promise<ShareDeps> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const nativePlatform = Capacitor.isNativePlatform();
  const deps: ShareDeps = {
    nativePlatform,
    canWebShare: typeof nav?.share === "function",
    canCopy: typeof nav?.clipboard?.writeText === "function",
    webShare: nav?.share ? (data) => nav.share(data) : undefined,
    copy: nav?.clipboard?.writeText ? (text) => nav.clipboard.writeText(text) : undefined,
  };
  if (nativePlatform) {
    const { Share } = await import("@capacitor/share");
    deps.nativeShare = (data) => Share.share(data);
  }
  return deps;
}

/**
 * The one Share: a preview of the spoiler-free result block, then the button
 * that sends it (share sheet, or clipboard with a toast saying so). The block's
 * last line is the challenge link, so sharing IS challenging. A finisher with
 * no real name is asked to sign first; a blank signature shares as "A friend".
 */
export function ShareResultButton({
  mode,
  blockFor,
  challengerName,
  hasTime,
  puzzleSize,
  daily,
  legend,
  onNameSigned,
  darkMode,
}: ShareResultButtonProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  const presetName = challengerName.trim();
  const hasRealName = isRealPlayerName(presetName);
  const [name, setName] = useState(hasRealName ? presetName : "");
  const unsigned = t("challenge.unsignedName");

  const effectiveName = (hasRealName ? presetName : name.trim()) || unsigned;
  const block = useMemo(() => blockFor(effectiveName), [blockFor, effectiveName]);

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
        const finalName = (hasRealName ? presetName : typedName) || unsigned;
        const toSend = blockFor(finalName);
        const result = await shareText(
          { text: toSend.text, body: toSend.body, url: toSend.link, title: t("completion.shareTitle") },
          await runtimeDeps(),
        );
        if (result.outcome === "dismissed") return;
        if (result.outcome === "failed") {
          flash(t("completion.shareFailed"));
          return;
        }
        setSigning(false);
        track("result_shared", { mode, method: result.method });
        if (hasTime) track("challenge_created", { size: puzzleSize, method: result.method });
        if (result.outcome === "copied") flash(t("completion.resultCopied"));
      } catch {
        // Sharing must never break the completion screen.
      } finally {
        setBusy(false);
      }
    },
    [busy, hasRealName, presetName, unsigned, blockFor, onNameSigned, t, flash, mode, hasTime, puzzleSize],
  );

  const handlePrimary = useCallback(() => {
    if (hasRealName || !hasTime || signing) doShare(name);
    else setSigning(true);
  }, [hasRealName, hasTime, signing, doShare, name]);

  const label = toast ?? (busy ? t("completion.sharing") : daily ? t("completion.shareDaily") : t("completion.share"));

  return (
    <div className="col-span-2 flex flex-col gap-2" data-testid="share-result">
      <ShareBlockPreview block={block} legend={legend} darkMode={darkMode} />
      {signing && (
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") doShare(name);
          }}
          placeholder={t("completion.signPlaceholder")}
          aria-label={t("completion.signPlaceholder")}
          autoFocus
          maxLength={24}
          className={`h-11 w-full rounded-xl border px-4 text-center text-base font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${
            darkMode
              ? "bg-white/5 border-stage-line text-white placeholder:text-white/40"
              : "bg-surface border-line-strong text-ink placeholder:text-subtle"
          }`}
        />
      )}
      <button onClick={handlePrimary} disabled={busy} className={buttonClass("primary", "lg", "w-full")}>
        {!toast && !busy && <Share2 className="size-4" aria-hidden="true" />}
        {label}
      </button>
    </div>
  );
}

/**
 * The block as it will paste: header, stats, the emoji rows, then the link —
 * and, when given, one legend line under the rows saying what the squares
 * mean (not part of the shared text).
 */
export function ShareBlockPreview({ block, legend, darkMode }: { block: ShareBlock; legend?: string; darkMode?: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="share-block-preview"
      aria-label={t("completion.sharePreviewLabel")}
      className={`rounded-2xl px-4 py-3 text-left ${darkMode ? "bg-white/5 ring-1 ring-stage-line" : "bg-surface-sunken"}`}
    >
      <p className={`text-sm font-semibold ${darkMode ? "text-white" : "text-ink"}`}>{block.header}</p>
      {block.stats && <p className={`text-sm ${darkMode ? "text-white/70" : "text-ink-soft"}`}>{block.stats}</p>}
      {/* Rows of up to 9 squares at 17px; a 15-block pace bar steps down so it
          fits a 375px phone inside the modal's padding. */}
      <div
        className={`mt-2 select-all leading-[1.15] tracking-[0.04em] ${[...(block.grid[0] ?? "")].length > 9 ? "text-[12px]" : "text-[17px]"}`}
        aria-hidden="true"
      >
        {block.grid.map((row, i) => (
          <div key={i}>{row}</div>
        ))}
      </div>
      {legend && (
        <p data-testid="share-legend" className={`mt-1.5 text-[11px] leading-snug ${darkMode ? "text-white/60" : "text-muted"}`}>
          {legend}
        </p>
      )}
      <p className={`mt-2 break-all text-xs ${darkMode ? "text-white/50" : "text-subtle"}`}>
        {block.cta} {displayLink(block.link)}
      </p>
    </div>
  );
}
