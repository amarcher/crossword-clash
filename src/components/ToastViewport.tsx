import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Info } from "lucide-react";
import { subscribeToasts, type Toast } from "../lib/toastBus";

interface DisplayToast extends Toast {
  id: number;
  leaving?: boolean;
}

/** Matches the .lf-toast-out duration in index.css. */
const EXIT_MS = 180;

let nextToastId = 1;

export function ToastViewport() {
  const [toasts, setToasts] = useState<DisplayToast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_MS);
  }, []);

  useEffect(() => {
    return subscribeToasts((toast) => {
      const id = nextToastId++;
      setToasts((prev) => [...prev, { ...toast, id }]);
      const ttl = toast.ttl ?? 5000;
      setTimeout(() => dismiss(id), ttl);
    });
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed left-1/2 z-[80] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2 pointer-events-none"
      style={{ top: "max(1rem, env(safe-area-inset-top))" }}
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => {
        const error = t.severity === "error";
        const Icon = error ? CircleAlert : Info;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto flex min-h-11 max-w-md items-start gap-2.5 rounded-2xl border px-4 py-2.5 text-left text-sm font-medium shadow-overlay transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
              t.leaving ? "lf-toast-out" : "lf-toast-in"
            } ${
              error
                ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100 active:bg-red-100"
                : "border-stage-line bg-stage text-white hover:bg-stage-raised active:bg-stage-raised"
            }`}
          >
            <Icon className={`mt-0.5 size-4 shrink-0 ${error ? "text-red-600" : "text-brand-200"}`} aria-hidden="true" />
            <span>{t.message}</span>
          </button>
        );
      })}
    </div>
  );
}
