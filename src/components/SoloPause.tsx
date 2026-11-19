import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Pause } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { formatDuration } from "../lib/soloStats";
import { Button } from "./ui";

export function SoloPause({ title, seconds, error, idle = false, onResume, onExit, onRetry }: {
  title: string; seconds: number; error: boolean;
  /** The clock paused itself after a minute without input: say so, since nobody pressed Pause. */
  idle?: boolean;
  onResume: () => void; onExit: () => void; onRetry: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onExit);
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="solo-pause-title"
      className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center overflow-y-auto bg-canvas p-6"
      style={{ paddingTop: "max(24px, env(safe-area-inset-top))", paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
      <div className="w-full max-w-sm text-center">
        <Pause className="mx-auto mb-5 size-8 text-brand-600" aria-hidden="true" />
        <h1 id="solo-pause-title" className="font-display text-3xl font-bold text-ink">{t("soloPause.paused")}</h1>
        <p className="mt-3 break-words text-lg font-semibold text-ink">{title}</p>
        <p data-testid="pause-clock" className="mt-1 text-lg tabular-nums text-ink-soft">{formatDuration(seconds)}</p>
        {/* Only what the player could not have guessed: a failed save, or a pause they did not ask for. */}
        {error && <p className="mt-4 text-sm text-muted" role="alert">{t("soloPause.saveError")}</p>}
        <div className="mt-7 grid gap-3">
          <Button size="lg" onClick={onResume}>{t("soloPause.resume")}</Button>
          {error ? <Button variant="secondary" size="lg" onClick={onRetry}>{t("soloPause.retry")}</Button>
            : <Button variant="secondary" size="lg" onClick={onExit}>{t("soloPause.exit")}</Button>}
        </div>
        {idle && <p className="mt-5 text-xs text-muted">{t("soloPause.idleHint")}</p>}
      </div>
    </div>
  );
}
