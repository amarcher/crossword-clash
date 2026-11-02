import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings2 } from "lucide-react";

interface AutocheckSwitchProps {
  /** The Autocheck setting as the grid plays by it (soloSettings.ts). */
  autocheck: boolean;
  onAutocheckChange: (on: boolean) => void;
  className?: string;
}

/**
 * The Autocheck switch with its one-line hint. The whole row is the switch (a
 * 44 px target, not just the track) and the selected state is the track's
 * fill, never an edge accent. Lives in the header gear's panel from `md` up
 * and in the phone's clue sheet below it, where the header has no room.
 */
export function AutocheckSwitch({ autocheck, onAutocheckChange, className = "" }: AutocheckSwitchProps) {
  const { t } = useTranslation();
  const id = useId();
  const labelId = `${id}-autocheck`;
  const hintId = `${id}-autocheck-hint`;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={autocheck}
      aria-labelledby={labelId}
      aria-describedby={hintId}
      onClick={() => onAutocheckChange(!autocheck)}
      className={`flex w-full min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-sunken active:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none ${className}`}
    >
      <span className="min-w-0 flex-1">
        <span id={labelId} className="block text-sm font-semibold text-ink">{t("autocheck.label")}</span>
        <span id={hintId} className="block text-xs leading-snug text-muted">{t("autocheck.hint")}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${autocheck ? "bg-brand-600" : "bg-line-strong"}`}
      >
        <span className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform ${autocheck ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}

/**
 * The solo play header's options control: a gear that opens a small panel
 * with the device's solo settings — today the one Autocheck switch. The panel
 * closes on Escape, an outside tap or a second press.
 */
export function SoloOptions({ autocheck, onAutocheckChange, className = "" }: AutocheckSwitchProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || !open) return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t("autocheck.options")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`grid size-11 place-items-center rounded-lg text-ink-soft hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-brand-500 ${
          open ? "bg-surface-sunken" : ""
        }`}
      >
        <Settings2 className="size-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t("autocheck.options")}
          className="absolute right-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-surface p-1.5 shadow-overlay ring-1 ring-line"
        >
          <AutocheckSwitch autocheck={autocheck} onAutocheckChange={onAutocheckChange} />
        </div>
      )}
    </div>
  );
}
