import { useEffect } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { useTranslation } from "react-i18next";
import { isChunkLoadError, reloadOnceForChunkError } from "../lib/chunkReload";
import { reportError } from "../lib/errorReporting";

/** Full-page notice shared by the error and not-found screens. */
export function NoticeScreen({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-col items-center justify-center min-h-dvh crossword-bg p-8 text-center">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg border border-neutral-200 p-6 sm:p-8">
        <h1 className="text-xl font-bold text-neutral-900 mb-2">{title}</h1>
        <p className="text-neutral-600 mb-6">{body}</p>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </main>
  );
}

export const primaryButtonClass =
  "block w-full px-6 py-3 rounded-xl font-semibold text-center text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
export const secondaryButtonClass =
  "block w-full px-6 py-3 rounded-xl font-semibold text-center text-blue-600 bg-white border-2 border-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

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
