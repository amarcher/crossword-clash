import { Download } from "lucide-react";
import { Card } from "../ui";
import { formatMegabytes, type WordListProgress } from "../../lib/seedgrid/wordListStore";

interface WordListDownloadProps {
  /** Bytes so far and the total when known; null before the first byte. */
  progress: WordListProgress | null;
  className?: string;
}

/**
 * The visible step while the engine's word list is downloaded, the first time
 * the studio opens on a device: what is happening, how big it is, and a bar.
 * Later opens read the list from the device and never show this.
 */
export function WordListDownload({ progress, className = "" }: WordListDownloadProps) {
  const total = progress?.total ?? null;
  const loaded = progress?.loaded ?? 0;
  const percent = total ? Math.min(100, Math.round((loaded / total) * 100)) : null;
  const size = total ? formatMegabytes(total) : "a few MB";
  return (
    <Card className={`p-4 ${className}`} role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Download className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">Downloading the word list</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {size}, once per device. The studio's fill engine runs on your device, so it needs the whole list here; after this it opens at once.
          </p>
          <div
            role="progressbar"
            aria-label="Word list download"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-valuetext={percent === null ? `${formatMegabytes(loaded)} so far` : `${percent}%`}
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          >
            <div
              className={`h-full rounded-full bg-brand-500 transition-[width] duration-200 ${percent === null ? "w-1/3 animate-pulse motion-reduce:animate-none" : ""}`}
              style={percent === null ? undefined : { width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-muted">
            {percent === null ? `${formatMegabytes(loaded)} so far` : percent >= 100 ? "Downloaded · the engine is reading it…" : `${percent}% · ${formatMegabytes(loaded)} of ${size}`}
          </p>
        </div>
      </div>
    </Card>
  );
}
