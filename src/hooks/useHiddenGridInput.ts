import { useCallback, useRef, type FormEvent, type KeyboardEvent, type RefObject } from "react";

/**
 * The hidden input always holds this zero-width character, so a soft-keyboard
 * Backspace has something to delete. Android keyboards often report it only
 * as an input change (keyCode 229), never as a Backspace keydown.
 */
export const GRID_INPUT_SENTINEL = "​";

export interface HiddenGridInputHandlers {
  /** A single letter, already matched against /[a-z]/i. */
  onLetter: (letter: string) => void;
  /** Backspace or Delete, on any keyboard that can express one. */
  onErase: () => void;
  onMove: (dRow: number, dCol: number) => void;
  /** Space (and, when set, Enter) toggles across / down. */
  onToggleDirection: () => void;
  /** Tab / Shift+Tab. The solver walks words; the studio leaves these unset. */
  onNextWord?: () => void;
  onPrevWord?: () => void;
  /** "." — the studio toggles a block; the solver leaves this unset. */
  onToggleBlock?: () => void;
  /** Enter, when a grid wants it (the studio treats it as a direction toggle). */
  onEnter?: () => void;
}

export interface HiddenGridInputOptions {
  /** A ref the owner already holds (the play screens refocus the grid from the clue bar). */
  ref?: RefObject<HTMLInputElement | null>;
  /** Accessible name of the input. */
  label: string;
  /** DOM id of the cell under the cursor, announced through aria-activedescendant. */
  activeDescendant?: string;
  /** DOM id of the grid the input drives (aria-controls, so the active descendant is in scope). */
  controls?: string;
}

/**
 * One visually hidden `<input>` per grid: phones get a keyboard, desktops get
 * letters, arrows, Backspace and the grid-specific keys. Three paths feed the
 * handlers, each used once per keystroke:
 *
 * 1. `onKeyDown` — desktop and iOS keyboards report real keys; handled and
 *    prevented, so nothing reaches the input's value.
 * 2. `onBeforeInput` — Android keyboards report `Unidentified` / 229 on keydown
 *    but still fire a cancelable `textInput` with the letter. Only a cancelable
 *    event is handled here, so a composition commit (not cancelable) falls
 *    through to path 3 instead of being counted twice.
 * 3. `onChange` — the input is controlled to a zero-width sentinel. A change
 *    that still contains the sentinel carries new letters; one that lost it
 *    was an erase, which is the only erase signal some Android keyboards give.
 *
 * The input must stay 16px (iOS zooms on anything smaller and never zooms
 * back) and must be focused synchronously inside a tap (iOS ignores focus
 * from a later task), so the returned `focus()` is meant for click handlers.
 */
export function useHiddenGridInput(handlers: HiddenGridInputHandlers | null, options: HiddenGridInputOptions) {
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = options.ref ?? internalRef;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const focus = useCallback(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    const h = handlersRef.current;
    if (!h || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key;
    if (/^[a-zA-Z]$/.test(key)) {
      h.onLetter(key);
    } else if (key === "Backspace" || key === "Delete") {
      h.onErase();
    } else if (key === "ArrowUp") {
      h.onMove(-1, 0);
    } else if (key === "ArrowDown") {
      h.onMove(1, 0);
    } else if (key === "ArrowLeft") {
      h.onMove(0, -1);
    } else if (key === "ArrowRight") {
      h.onMove(0, 1);
    } else if (key === " ") {
      h.onToggleDirection();
    } else if (key === "Tab" && (e.shiftKey ? h.onPrevWord : h.onNextWord)) {
      (e.shiftKey ? h.onPrevWord : h.onNextWord)!();
    } else if (key === "." && h.onToggleBlock) {
      h.onToggleBlock();
    } else if (key === "Enter" && h.onEnter) {
      h.onEnter();
    } else {
      return;
    }
    e.preventDefault();
  }, []);

  /** Dispatch the characters a soft keyboard produced, one handler call each. */
  const takeText = useCallback((text: string) => {
    const h = handlersRef.current;
    if (!h) return;
    for (const ch of text) {
      if (/[a-zA-Z]/.test(ch)) h.onLetter(ch);
      else if (ch === " ") h.onToggleDirection();
      else if (ch === "." && h.onToggleBlock) h.onToggleBlock();
    }
  }, []);

  const onBeforeInput = useCallback(
    (e: FormEvent<HTMLInputElement>) => {
      const native = e.nativeEvent as InputEvent;
      if (!handlersRef.current || !native.cancelable) return;
      const data = native.data;
      if (data && /^[a-zA-Z]$/.test(data)) {
        e.preventDefault();
        takeText(data);
      }
    },
    [takeText],
  );

  const onChange = useCallback(
    (e: FormEvent<HTMLInputElement>) => {
      const value = e.currentTarget.value;
      if (!value.includes(GRID_INPUT_SENTINEL)) handlersRef.current?.onErase();
      else takeText(value.split(GRID_INPUT_SENTINEL).join(""));
    },
    [takeText],
  );

  // Park the caret after the sentinel, so Backspace has it in reach.
  const onFocus = useCallback((e: FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    try {
      el.setSelectionRange(el.value.length, el.value.length);
    } catch {
      // Some input types refuse selection ranges; the sentinel still works without it.
    }
  }, []);

  const inputProps = {
    ref: inputRef,
    value: GRID_INPUT_SENTINEL,
    className: "absolute size-px opacity-0",
    style: {
      top: "50%",
      left: "50%",
      fontSize: "16px", // prevents iOS auto-zoom on focus
      caretColor: "transparent",
      border: "none",
      padding: 0,
      margin: 0,
    } as const,
    name: "crossword-cell",
    autoCapitalize: "characters",
    autoCorrect: "off",
    autoComplete: "nofill",
    spellCheck: false,
    enterKeyHint: "next",
    inputMode: "text",
    "aria-label": options.label,
    "aria-activedescendant": options.activeDescendant,
    "aria-controls": options.controls,
    "data-form-type": "other",
    "data-lpignore": "true",
    "data-1p-ignore": true,
    onKeyDown,
    onBeforeInput,
    onChange,
    onFocus,
  } as const;

  return { inputRef, inputProps, focus };
}
