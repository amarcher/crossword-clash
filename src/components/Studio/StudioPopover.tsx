import { useEffect, useId, useRef, useState, type ReactNode } from "react";

interface StudioPopoverProps {
  /** Accessible name of the trigger, e.g. "How the word list works". */
  label: string;
  /** The trigger's face (an icon). */
  icon: ReactNode;
  /** Which edge of the trigger the panel lines up with. */
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}

/**
 * A small "?"/"i" button that opens a panel of help text under it. The studio
 * keeps its instructions and legends here, so they cost no height until asked
 * for; Escape, a click outside or a second click closes it.
 */
export function StudioPopover({ label, icon, align = "right", className = "", children }: StudioPopoverProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <span ref={root} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-ink active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500 aria-expanded:bg-surface-sunken aria-expanded:text-ink"
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
      </button>
      {open && (
        <div
          id={panelId}
          role="note"
          className={`absolute top-full z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-3 text-xs leading-relaxed text-ink-soft shadow-overlay ${align === "right" ? "right-0" : "left-0"}`}
        >
          {children}
        </div>
      )}
    </span>
  );
}
