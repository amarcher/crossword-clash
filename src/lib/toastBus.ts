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
  // Defer to a microtask so callers can safely emit during render
  // (e.g., extractPuzzleFromUrl runs inside a useState lazy initializer
  // in GameContext/HostLayout). Synchronous dispatch would call
  // setToasts on ToastViewport while another component is still
  // rendering, triggering React's "update during render" warning.
  queueMicrotask(() => {
    for (const l of listeners) l(toast);
  });
}

export function subscribeToasts(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
