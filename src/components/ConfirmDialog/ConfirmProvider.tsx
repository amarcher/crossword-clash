import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" uses a red confirm button and an alertdialog role. */
  tone?: "default" | "danger";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface Pending extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

let nextId = 1;

/** `const confirm = useConfirm(); if (await confirm({ title })) ...` */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

/**
 * Mount once at the app root (above the router). Requests made while a dialog
 * is open are queued and shown one at a time.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Pending[]>([]);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setQueue((q) => [...q, { ...options, id: nextId++, resolve }]);
      }),
    [],
  );

  const current = queue[0] ?? null;
  const settledId = useRef(0);
  const settle = useCallback(
    (ok: boolean) => {
      if (!current || settledId.current === current.id) return; // ignore double-fire (Esc + click)
      settledId.current = current.id;
      current.resolve(ok);
      setQueue((q) => q.filter((p) => p.id !== current.id));
    },
    [current],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {current && <ConfirmDialog key={current.id} {...current} onSettle={settle} />}
    </ConfirmContext.Provider>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "default",
  onSettle,
}: ConfirmOptions & { onSettle: (ok: boolean) => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const danger = tone === "danger";

  // Move focus in; restore it to whatever had it when the dialog closes.
  // Destructive dialogs start on Cancel so a stray Enter can't confirm.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (danger ? cancelRef.current : confirmRef.current)?.focus();
    return () => {
      previous?.focus?.();
    };
  }, [danger]);

  // Esc cancels; Tab is trapped inside the panel.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onSettle(false);
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (!panelRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onSettle]);

  const btn =
    "min-h-11 flex-1 px-4 py-2.5 rounded-xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overscroll-contain"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
      }}
    >
      <div data-testid="confirm-backdrop" className="absolute inset-0 bg-black/60" onClick={() => onSettle(false)} />
      <div
        ref={panelRef}
        role={danger ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className="relative w-full max-w-sm max-h-full overflow-y-auto overscroll-contain rounded-2xl bg-white text-neutral-900 shadow-2xl p-6"
      >
        <h2 id={titleId} className="text-lg font-bold mb-2">
          {title}
        </h2>
        {body && (
          <p id={bodyId} className="text-neutral-600 mb-6">
            {body}
          </p>
        )}
        <div className={`flex gap-3 ${body ? "" : "mt-6"}`}>
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onSettle(false)}
            className={`${btn} text-neutral-700 bg-white border-2 border-neutral-300 hover:bg-neutral-100 active:bg-neutral-200 focus-visible:ring-blue-500`}
          >
            {cancelLabel ?? t("confirmDialog.cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onSettle(true)}
            className={`${btn} text-white ${
              danger
                ? "bg-red-600 hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500"
                : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-blue-500"
            }`}
          >
            {confirmLabel ?? t("confirmDialog.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
