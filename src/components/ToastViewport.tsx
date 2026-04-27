import { useEffect, useState } from "react";
import { subscribeToasts, type Toast } from "../lib/toastBus";

interface DisplayToast extends Toast {
  id: number;
}

let nextToastId = 1;

export function ToastViewport() {
  const [toasts, setToasts] = useState<DisplayToast[]>([]);

  useEffect(() => {
    return subscribeToasts((toast) => {
      const id = nextToastId++;
      setToasts((prev) => [...prev, { ...toast, id }]);
      const ttl = toast.ttl ?? 5000;
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, ttl);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          className={`pointer-events-auto px-4 py-2 rounded-lg shadow-lg text-sm max-w-md text-left ${
            t.severity === "error"
              ? "bg-red-500/95 text-white"
              : "bg-neutral-800/95 text-white"
          } hover:opacity-90 transition-opacity`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
