import { useTranslation } from "react-i18next";
import type { NavigationActions } from "./CrosswordGrid";

interface PuzzleKeyboardProps {
  actions: NavigationActions;
  disabled?: boolean;
  allowDelete?: boolean;
}

/** Always-visible game controls: no text field, OS keyboard, or autocomplete. */
export function PuzzleKeyboard({ actions, disabled = false, allowDelete = true }: PuzzleKeyboardProps) {
  const { t } = useTranslation();
  return (
    <div className="puzzle-keyboard" role="group" aria-label={t("keyboard.label")}>
      {["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map((row, index) => (
        <div className={`puzzle-keyboard-row puzzle-keyboard-row-${index}`} key={row}>
          {index === 2 && (
            <button type="button" className="puzzle-key puzzle-key-action" disabled={disabled}
              onPointerDown={event => event.preventDefault()} onClick={actions.toggleDirection}
              aria-label={t("keyboard.switchDirection")}>
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M4 6h15m-4-4 4 4-4 4M6 11v10m-4-4 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {[...row].map(letter => (
            <button type="button" className="puzzle-key" key={letter} disabled={disabled}
              onPointerDown={event => event.preventDefault()} onClick={() => actions.inputLetter(letter)}>
              {letter}
            </button>
          ))}
          {index === 2 && (
            <button type="button" className="puzzle-key puzzle-key-action" disabled={disabled}
              onPointerDown={event => event.preventDefault()}
              onClick={allowDelete ? actions.deleteLetter : actions.nextWord}
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
