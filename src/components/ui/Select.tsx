import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Options sharing a group are listed under that heading (like <optgroup>). */
  group?: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
  /** "stage" for the dark TV display. */
  variant?: "default" | "stage";
  size?: "sm" | "md";
  /** Stretch the trigger to its container's width. */
  block?: boolean;
  className?: string;
}

const TRIGGER = {
  default:
    "border border-line-strong bg-surface text-ink hover:border-subtle/60 hover:bg-surface-sunken/60 active:bg-surface-sunken aria-expanded:border-brand-500",
  stage: "border border-stage-line bg-stage text-slate-100 hover:border-slate-500 active:bg-stage-raised aria-expanded:border-brand-500",
};
const LIST = {
  default: "border border-line bg-surface text-ink shadow-overlay",
  stage: "border border-stage-line bg-stage-raised text-slate-100 shadow-overlay",
};
const OPTION_ACTIVE = { default: "bg-surface-sunken", stage: "bg-stage-line" };
const OPTION_SELECTED = { default: "font-semibold text-brand-700", stage: "font-semibold text-brand-200" };
const GROUP = { default: "text-subtle", stage: "text-slate-400" };

const GAP = 4;
const MAX_LIST_HEIGHT = 320;

/**
 * The app's dropdown: a button showing the current value, opening a list just
 * below it (above only when there isn't room). Follows the ARIA combobox +
 * listbox pattern: focus stays on the button, arrows move through options,
 * Enter/Space picks, Escape closes, and typing a letter jumps to it.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  id,
  disabled,
  variant = "default",
  size = "md",
  block,
  className = "",
  ...rest
}: SelectProps<T>) {
  const autoId = useId();
  const triggerId = id ?? `${autoId}-trigger`;
  const listId = `${autoId}-list`;
  const optionId = (i: number) => `${autoId}-option-${i}`;
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; minWidth: number; maxHeight: number } | null>(null);
  const typeahead = useRef({ text: "", at: 0 });

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  const place = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - GAP - 8;
    const above = rect.top - GAP - 8;
    const wanted = Math.min(MAX_LIST_HEIGHT, options.length * 44 + 16);
    const flip = below < wanted && above > below;
    setPosition({
      ...(flip ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      minWidth: rect.width,
      maxHeight: Math.max(120, Math.min(MAX_LIST_HEIGHT, flip ? above : below)),
    });
  }, [options.length]);

  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex);
    place();
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const choose = (i: number) => {
    const option = options[i];
    if (option && option.value !== value) onChange(option.value);
    close();
  };

  // Keep the list attached to the trigger while the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!open) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  // Close on a press anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!trigger.current?.contains(target) && !list.current?.contains(target)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
    // optionId is derived from a stable id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const last = options.length - 1;
    if (e.key === "ArrowDown") setActive((i) => Math.min(last, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter" || e.key === " ") choose(active);
    else if (e.key === "Escape") close();
    else if (e.key === "Tab") {
      setOpen(false);
      return;
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const now = Date.now();
      const text = (now - typeahead.current.at < 700 ? typeahead.current.text : "") + e.key.toLowerCase();
      typeahead.current = { text, at: now };
      const match = options.findIndex((o) => o.label.toLowerCase().startsWith(text));
      if (match >= 0) setActive(match);
    } else return;
    e.preventDefault();
  };

  const sizing = size === "sm" ? "h-9 px-2.5 text-sm" : "min-h-11 px-3 text-base md:text-sm";

  return (
    <>
      <button
        {...rest}
        ref={trigger}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={`inline-flex items-center justify-between gap-2 rounded-xl text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-45 ${sizing} ${TRIGGER[variant]} ${block ? "w-full" : ""} ${className}`}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown className={`size-4 shrink-0 opacity-60 transition-transform duration-150 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open &&
        position &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-labelledby={triggerId}
            tabIndex={-1}
            className={`fixed z-[60] overflow-y-auto overscroll-contain rounded-xl p-1 motion-safe:animate-[select-in_120ms_ease-out] ${LIST[variant]}`}
            style={{ top: position.top, bottom: position.bottom, left: position.left, minWidth: position.minWidth, maxHeight: position.maxHeight }}
          >
            {options.map((option, i) => {
              const heading = option.group && option.group !== options[i - 1]?.group ? option.group : null;
              const isSelected = i === selectedIndex;
              return (
                <li key={`${option.group ?? ""}:${option.value}`} role="none">
                  {heading && (
                    <div role="presentation" className={`px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.06em] ${GROUP[variant]}`}>
                      {heading}
                    </div>
                  )}
                  <div
                    id={optionId(i)}
                    role="option"
                    aria-selected={isSelected}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-base md:min-h-9 md:text-sm ${i === active ? OPTION_ACTIVE[variant] : ""} ${isSelected ? OPTION_SELECTED[variant] : ""}`}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => choose(i)}
                  >
                    <span className="flex-1 whitespace-nowrap">{option.label}</span>
                    <Check className={`size-4 shrink-0 ${isSelected ? "" : "invisible"}`} aria-hidden="true" />
                  </div>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
