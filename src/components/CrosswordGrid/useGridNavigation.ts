import { useEffect, useRef } from "react";

interface NavigationActions {
  inputLetter: (letter: string) => void;
  deleteLetter: () => void;
  moveSelection: (dr: number, dc: number) => void;
  nextWord: () => void;
  prevWord: () => void;
  toggleDirection: () => void;
}

export function useGridNavigation(actions: NavigationActions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const a = actionsRef.current;
      const key = e.key;

      // Letter input
      if (/^[a-zA-Z]$/.test(key)) {
        e.preventDefault();
        a.inputLetter(key);
        return;
      }

      switch (key) {
        case "Backspace":
          e.preventDefault();
          a.deleteLetter();
          break;
        case "ArrowUp":
          e.preventDefault();
          a.moveSelection(-1, 0);
          break;
        case "ArrowDown":
          e.preventDefault();
          a.moveSelection(1, 0);
          break;
        case "ArrowLeft":
          e.preventDefault();
          a.moveSelection(0, -1);
          break;
        case "ArrowRight":
          e.preventDefault();
          a.moveSelection(0, 1);
          break;
        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            a.prevWord();
          } else {
            a.nextWord();
          }
          break;
        case " ":
          e.preventDefault();
          a.toggleDirection();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
