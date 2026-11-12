import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SHARE_URL } from "../../lib/resultCard";

/**
 * The finished daily's replay clip (api/replay.ts) above Share: the sender
 * sees exactly what the link preview will play before deciding to share, and
 * loading it here renders and caches the clip before any preview asks for it.
 * Always the production URL (the link's own); hidden if it can't load.
 */
export function ReplayPreview({ code, darkMode }: { code: string; darkMode?: boolean }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const src = `${SHARE_URL}/api/replay?r=${code}`;
  return (
    <figure data-testid="replay-preview" className="mb-1">
      <video
        src={src}
        poster={`${src}&poster=1`}
        autoPlay
        muted
        loop
        playsInline
        aria-label={t("completion.replayPreviewLabel")}
        onError={() => setFailed(true)}
        className={`aspect-video w-full rounded-xl object-cover ${darkMode ? "ring-1 ring-stage-line" : "ring-1 ring-line"}`}
      />
      <figcaption className={`mt-1.5 text-center text-xs ${darkMode ? "text-white/60" : "text-muted"}`}>{t("completion.replayPreviewCaption")}</figcaption>
    </figure>
  );
}
