/**
 * Tiny pub-sub for app-wide toasts. Lives outside React so non-component
 * code (puzzleService, narrator backends, etc.) can surface user-facing
 * errors without prop-drilling a callback.
 *
 * The Toast UI lives in <ToastViewport> mounted inside RootLayout.
 */

export type ToastSeverity = "info" | "error";

export interface Toast {
  message: string;
  severity?: ToastSeverity;
  /** Time-to-live in ms. Default 5000. */
  ttl?: number;
}

type Listener = (toast: Toast) => void;

const listeners = new Set<Listener>();

export function emitToast(toast: Toast): void {
  for (const l of listeners) l(toast);
}

export function subscribeToasts(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
