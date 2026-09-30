import { useEffect } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { useTranslation } from "react-i18next";
import { TriangleAlert, type LucideIcon } from "lucide-react";
import { SiteBar } from "../components/SiteBar";
import { Card, buttonClass } from "../components/ui";
import { isChunkLoadError, reloadOnceForChunkError } from "../lib/chunkReload";
import { reportError } from "../lib/errorReporting";

/** Full-page notice shared by the error and not-found screens. */
export function NoticeScreen({
  title,
  body,
  icon: Icon = TriangleAlert,
  children,
}: {
  title: string;
  body: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col crossword-bg px-4 pb-10 pt-2">
      {/* Plain anchor: this screen can render outside the app's providers, and a
          full navigation also resets any broken app state. */}
      <SiteBar plain />
      <div className="flex flex-1 items-center justify-center py-8">
        <Card className="w-full max-w-sm p-6 text-center shadow-raised sm:p-8">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-gold-50 text-gold-700 ring-1 ring-gold-100">
            <Icon className="size-6" aria-hidden="true" />
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-2 text-muted">{body}</p>
          <div className="mt-6 flex flex-col gap-2.5">{children}</div>
        </Card>
      </div>
    </main>
  );
}

export const primaryButtonClass = buttonClass("primary", "lg", "w-full");
export const secondaryButtonClass = buttonClass("secondary", "lg", "w-full");

/**
 * errorElement for the top-level routes. Rendered OUTSIDE the layout
 * providers (the layout is what crashed), so it must not use app contexts and
 * uses plain anchors (a full navigation also resets any broken app state).
 */
export function RouteErrorScreen() {
  const { t } = useTranslation();
  const error = useRouteError();
  const stale = isChunkLoadError(error);

  useEffect(() => {
    if (stale) {
      // A stale tab after a deploy: one automatic reload picks up the new
      // chunk hashes. If we already reloaded recently this returns false and
      // the manual screen below stays up.
      reloadOnceForChunkError();
      return;
    }
    // 404s from unmatched URLs are expected, not bugs.
    if (isRouteErrorResponse(error) && error.status === 404) return;
    reportError(error, { source: "route-error-boundary" });
  }, [error, stale]);

  return (
    <NoticeScreen
      title={stale ? t("errors.updatedTitle") : t("errors.title")}
      body={stale ? t("errors.updatedBody") : t("errors.body")}
    >
      <button type="button" onClick={() => window.location.reload()} className={primaryButtonClass}>
        {t("errors.reload")}
      </button>
      <a href="/" className={secondaryButtonClass}>
        {t("errors.backToMenu")}
      </a>
    </NoticeScreen>
  );
}
