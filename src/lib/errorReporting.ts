/**
 * Error reporting. Sentry (@sentry/react) is loaded via dynamic import ONLY
 * when VITE_SENTRY_DSN is set and this is not the native (mobile) build, so
 * the SDK never lands in the main bundle or runs unconfigured. Otherwise
 * everything here is a no-op (console.error in dev).
 *
 * Not for expected failures (localStorage/JSON-parse fallbacks) — only
 * unexpected ones.
 */

type SentryModule = typeof import("@sentry/react");

let sentryPromise: Promise<SentryModule | null> | null = null;
let initialized = false;

/** Reporting is enabled when a DSN is configured and we're not in mobile mode. */
export function isErrorReportingEnabled(): boolean {
  return !!import.meta.env.VITE_SENTRY_DSN && import.meta.env.MODE !== "mobile";
}

function loadSentry(): Promise<SentryModule | null> {
  if (!isErrorReportingEnabled()) return Promise.resolve(null);
  if (!sentryPromise) {
    sentryPromise = import("@sentry/react")
      .then((Sentry) => {
        Sentry.init({
          dsn: import.meta.env.VITE_SENTRY_DSN as string,
          environment: import.meta.env.MODE,
          // Errors only: no tracing, replay, or PII.
          tracesSampleRate: 0,
        });
        return Sentry;
      })
      .catch(() => null);
  }
  return sentryPromise;
}

/** Stale/unavailable code chunk — handled by a reload, not worth reporting. */
function isChunkLoadNoise(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg);
}

/** Install window error/unhandledrejection hooks. Safe to call once at startup. */
export function initErrorReporting(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("error", (event) => {
    reportError(event.error ?? event.message, { source: "window.error" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, { source: "unhandledrejection" });
  });
  if (isErrorReportingEnabled()) void loadSentry();
}

export function reportError(err: unknown, context?: Record<string, unknown>): void {
  if (isChunkLoadNoise(err)) return;
  if (!isErrorReportingEnabled()) {
    if (import.meta.env.DEV) console.error("[reportError]", err, context ?? "");
    return;
  }
  void loadSentry().then((Sentry) => {
    if (!Sentry) return;
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      extra: context,
    });
  });
}
