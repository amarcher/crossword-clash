import { useMemo, useRef, type MouseEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { NavigationActions } from "./CrosswordGrid";

interface PuzzleKeyboardProps {
  actions: NavigationActions;
  disabled?: boolean;
  allowDelete?: boolean;
}

/**
 * How long after a pointer lifts its `click` may still arrive. The click that
 * belongs to a press we already handled is dropped; one outside this window
 * (or with no press before it) is a key press made some other way and runs.
 */
export const CLICK_AFTER_POINTER_MS = 700;

/** A press in progress: its click, whenever it comes, is not a second press. */
const HELD = Number.POSITIVE_INFINITY;

/**
 * Keys act when the finger lands, not on `click`. A phone makes a click only
 * out of a lone finger's tap: when a second thumb lands before the first has
 * lifted (ordinary fast typing), neither touch becomes a click, the letters
 * are lost, and every letter after them is typed one square early — which
 * under autocheck is a refusal of a correct letter. Each touch has its own
 * `pointerdown`, overlapping or not.
 *
 * `click` stays for what has no pointer: Enter / Space on a focused key,
 * switch control, a screen reader's activate. `pressed` remembers per key
 * when its pointer went down (HELD) and came up, so the click a tap also
 * produces is recognised and dropped instead of typing the letter twice.
 */
function usePressHandlers(disabled: boolean) {
  const pressed = useRef(new Map<string, number>());
  return useMemo(() => {
    const lift = (id: string) => (event: PointerEvent<HTMLButtonElement>) => {
      if (pressed.current.has(id)) pressed.current.set(id, event.timeStamp);
    };
    return (id: string, run: () => void) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        // Keeps focus where it is (no focus ring walking the keys, no scroll).
        event.preventDefault();
        if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
        pressed.current.set(id, HELD);
        run();
      },
      onPointerUp: lift(id),
      onPointerCancel: lift(id),
      onPointerLeave: lift(id),
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        const at = pressed.current.get(id);
        if (at !== undefined) {
          pressed.current.delete(id);
          if (at === HELD || event.timeStamp - at < CLICK_AFTER_POINTER_MS) return;
        }
        if (!disabled) run();
      },
    });
  }, [disabled]);
}

/** Always-visible game controls: no text field, OS keyboard, or autocomplete. */
export function PuzzleKeyboard({ actions, disabled = false, allowDelete = true }: PuzzleKeyboardProps) {
  const { t } = useTranslation();
  const press = usePressHandlers(disabled);
  return (
    <div className="puzzle-keyboard" role="group" aria-label={t("keyboard.label")}>
      {["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map((row, index) => (
        <div className={`puzzle-keyboard-row puzzle-keyboard-row-${index}`} key={row}>
          {index === 2 && (
            <button type="button" className="puzzle-key puzzle-key-action" disabled={disabled}
              {...press("direction", actions.toggleDirection)}
              aria-label={t("keyboard.switchDirection")}>
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M4 6h15m-4-4 4 4-4 4M6 11v10m-4-4 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {[...row].map(letter => (
            <button type="button" className="puzzle-key" key={letter} disabled={disabled}
              {...press(letter, () => actions.inputLetter(letter))}>
              {letter}
            </button>
          ))}
          {index === 2 && (
            <button type="button" className="puzzle-key puzzle-key-action" disabled={disabled}
              {...press("action", allowDelete ? actions.deleteLetter : actions.nextWord)}
              aria-label={t(allowDelete ? "keyboard.delete" : "clueBar.nextClue")}>
              {allowDelete ? (
                <svg aria-hidden="true" width="26" height="24" viewBox="0 0 26 24" fill="none">
                  <path d="M10 4h13v16H10L2 12l8-8Zm3 5 6 6m0-6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              ) : <span aria-hidden="true">→</span>}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
