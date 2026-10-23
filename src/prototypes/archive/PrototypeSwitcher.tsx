/**
 * PROTOTYPE — throwaway. The floating variant switcher from the prototype
 * skill: a bottom-centre pill with ← / → that updates `?variant=` (shareable,
 * reload-stable) and reacts to the arrow keys. Renders nothing in a
 * production build so a stray merge can never ship it.
 */
import { useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface VariantDef {
  key: string;
  name: string;
}

interface Props {
  variants: readonly VariantDef[];
  current: string;
  onChange: (key: string) => void;
  /** Extra controls (the fake-history toggle). */
  children?: ReactNode;
}

export function PrototypeSwitcher({ variants, current, onChange, children }: Props) {
  const index = Math.max(0, variants.findIndex((v) => v.key === current));
  const step = (delta: number) => onChange(variants[(index + delta + variants.length) % variants.length].key);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  const btn = "grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white active:bg-white/20 focus-visible:outline-2 focus-visible:outline-gold-400";
  return (
    <div
      role="toolbar"
      aria-label="Prototype variants"
      className="fixed inset-x-0 z-50 flex justify-center px-4 pointer-events-none"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-ink/95 py-1 pl-1 pr-2 text-sm text-white shadow-overlay ring-1 ring-white/10 backdrop-blur">
        <button type="button" className={btn} onClick={() => step(-1)} aria-label="Previous variant">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <span className="min-w-28 text-center font-semibold tabular-nums">
          {variants[index].key} · {variants[index].name}
        </span>
        <button type="button" className={btn} onClick={() => step(1)} aria-label="Next variant">
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
        {children && <span className="ml-1 border-l border-white/15 pl-2">{children}</span>}
      </div>
    </div>
  );
}
