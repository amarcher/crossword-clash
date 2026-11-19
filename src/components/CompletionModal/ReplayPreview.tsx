import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SHARE_URL } from "../../lib/resultCard";

/**
 * The link preview as a message will show it, above Share: the replay clip
 * (api/replay.ts) and, under it, the title the link unfurls with
 * (linkPreview.ts) and the site, so the sender sees exactly what they are
 * about to send. Loading the clip here also renders and caches it before any
 * preview asks for it. Always the production URL (the link's own). Without a
 * clip (none filed, or it can't load) the title and site stand alone; without
 * a title (a link that doesn't unfurl as the solve) the clip keeps its caption.
 */
export function ReplayPreview({ id, race, title, darkMode }: { id?: string | null; race?: boolean; title?: string | null; darkMode?: boolean }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const src = id && !failed ? `${SHARE_URL}/api/replay?s=${id}` : null;
  if (!src && !title) return null;
  const ring = darkMode ? "ring-1 ring-stage-line" : "ring-1 ring-line";
  return (
    <figure data-testid="replay-preview" className={title ? `mb-1 overflow-hidden rounded-2xl ${ring}` : "mb-1"}>
      {src && (
        <video
          src={src}
          poster={`${src}&poster=1`}
          autoPlay
          muted
          loop
          playsInline
          aria-label={t(race ? "completion.raceReplayPreviewLabel" : "completion.replayPreviewLabel")}
          onError={() => setFailed(true)}
          className={`aspect-video w-full object-cover ${title ? "" : `rounded-xl ${ring}`}`}
        />
      )}
      {title ? (
        <figcaption data-testid="link-preview-title" className={`px-3 py-2 text-left ${darkMode ? "bg-white/5" : "bg-surface-sunken"}`}>
          <span className={`block text-sm leading-snug font-semibold text-pretty ${darkMode ? "text-white" : "text-ink"}`}>{title}</span>
          <span className={`block text-xs ${darkMode ? "text-white/60" : "text-muted"}`}>{SHARE_URL.replace(/^https?:\/\//, "")}</span>
        </figcaption>
      ) : (
        <figcaption className={`mt-1.5 text-center text-xs ${darkMode ? "text-white/60" : "text-muted"}`}>{t("completion.replayPreviewCaption")}</figcaption>
      )}
    </figure>
  );
}
