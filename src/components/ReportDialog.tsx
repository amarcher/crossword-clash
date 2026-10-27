import { useCallback, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Flag, X } from "lucide-react";
import { Button } from "./ui";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { track } from "../lib/analytics";
import { CommunityError, MAX_REPORT_DETAILS, REPORT_REASONS, reportPuzzle, type ReportReason } from "../lib/communityPuzzles";

interface ReportDialogProps {
  puzzleId: string;
  onClose: () => void;
}

/**
 * Report a community puzzle (docs/community-puzzles-spec.md §3.1): four
 * reasons, an optional note, one tap. Anyone signed in (anonymous included)
 * may report; the server refuses the author's own puzzle, a second open
 * report and more than ten a day.
 */
export function ReportDialog({ puzzleId, onClose }: ReportDialogProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panelRef, handleEscape);

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<"held" | "open" | null>(null);

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const { held } = await reportPuzzle(puzzleId, reason, details);
      track("puzzle_reported", { reason });
      setSent(held ? "held" : "open");
    } catch (err) {
      const kind = err instanceof CommunityError ? err.kind : "failed";
      setError(
        kind === "already_reported"
          ? t("community.reportAlready")
          : kind === "own_puzzle"
            ? t("community.reportOwn")
            : kind === "rate_limited"
              ? t("community.reportRateLimited")
              : t("community.reportFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end justify-center overscroll-contain sm:items-center"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
      }}
    >
      <div data-testid="report-backdrop" className="lf-fade-in absolute inset-0 bg-stage/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="lf-pop-in scroll-quiet relative max-h-full w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-6 text-ink shadow-overlay"
      >
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-50 text-gold-700">
            <Flag className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-lg font-bold leading-snug tracking-tight">
              {t("community.reportTitle")}
            </h2>
            {!sent && <p className="mt-1.5 text-sm leading-relaxed text-muted">{t("community.reportBody")}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("community.close")}
            className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5">
          {sent ? (
            <div className="flex flex-col gap-4">
              <p role="status" className="text-sm leading-relaxed text-ink-soft">
                {sent === "held" ? t("community.thanksHeld") : t("community.thanks")}
              </p>
              <Button variant="secondary" block onClick={onClose}>
                {t("community.done")}
              </Button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <fieldset className="flex flex-col gap-1">
                <legend className="sr-only">{t("community.reportBody")}</legend>
                {REPORT_REASONS.map((r) => (
                  <label
                    key={r}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${reason === r ? "bg-brand-50 text-brand-800" : "text-ink hover:bg-surface-sunken active:bg-surface-sunken"}`}
                  >
                    <input type="radio" name="reason" value={r} className="size-4 accent-brand-600" checked={reason === r} onChange={() => setReason(r)} />
                    {t(`community.reasons.${r}`)}
                  </label>
                ))}
              </fieldset>
              {reason === "copied" && (
                <p className="rounded-xl bg-surface-sunken px-3 py-2 text-xs leading-snug text-ink-soft">
                  {t("community.copyrightHint")}{" "}
                  <a href="/copyright" target="_blank" rel="noopener" className="font-semibold text-brand-700 underline decoration-brand-200 underline-offset-2">
                    {t("community.copyrightLink")}
                  </a>
                </p>
              )}
              <label className="block text-sm font-medium text-ink-soft">
                {t("community.detailsLabel")}
                <textarea
                  className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500 md:text-sm"
                  rows={2}
                  maxLength={MAX_REPORT_DETAILS}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="mt-1 flex gap-2">
                <Button variant="ghost" onClick={onClose} className="flex-1">
                  {t("community.cancel")}
                </Button>
                <Button type="submit" className="flex-1" disabled={!reason || busy} aria-busy={busy || undefined}>
                  {busy ? t("community.sending") : t("community.send")}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
