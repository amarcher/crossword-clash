import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

interface WordSheetProps {
  open: boolean;
  onClose: () => void;
  /** "Words for 1 Across". */
  label: string;
  /** The grid's box: the sheet rises to just under it, so the grid stays in view and in reach. */
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/** The sheet never gets shorter than this, even when the grid leaves less room (it covers the grid's foot instead). */
const MIN_HEIGHT = 288;
/** A drag down the handle past this closes the sheet. */
const CLOSE_DRAG_PX = 72;

/**
 * The phone's word list, pulled up from the bottom over the tools and tab bar
 * while the grid stays visible above (it replaced a Words tab, 2026-11-12).
 * Not modal: a tap on another square changes the entry and the list with it.
 * Closes with ✕, Escape, or a drag down on the handle.
 */
export function WordSheet({ open, onClose, label, anchor, children }: WordSheetProps) {
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

  // Rise to the grid's foot; follow it if the viewport changes (rotation, the keyboard).
  useLayoutEffect(() => {
    if (!open) return;
    const fit = () => {
      const bottom = anchor.current?.getBoundingClientRect().bottom ?? window.innerHeight / 2;
      setHeight(Math.max(MIN_HEIGHT, Math.round(window.innerHeight - bottom - 8)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-overlay"
      style={{ height, transform: drag ? `translateY(${drag}px)` : undefined }}
    >
      <div
        className="flex shrink-0 cursor-grab touch-none items-center justify-between gap-2 px-4 pt-2 pb-1"
        onPointerDown={(e) => {
          start.current = e.clientY;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current));
        }}
        onPointerUp={() => {
          if (drag > CLOSE_DRAG_PX) onClose();
          start.current = null;
          setDrag(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrag(0);
        }}
      >
        <span className="w-11" aria-hidden="true" />
        <span className="h-1.5 w-10 rounded-full bg-line-strong" aria-hidden="true" />
        <button
          type="button"
          aria-label="Close the word list"
          className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-ink active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">{children}</div>
    </section>
  );
}
