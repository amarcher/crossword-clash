import { useEffect } from "react";

interface NavigationActions {
  inputLetter: (letter: string) => void;
  deleteLetter: () => void;
  moveSelection: (dr: number, dc: number) => void;
  nextWord: () => void;
  prevWord: () => void;
  toggleDirection: () => void;
}

export function useGridNavigation(actions: NavigationActions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key;

      // Letter input
      if (/^[a-zA-Z]$/.test(key)) {
        e.preventDefault();
        actions.inputLetter(key);
        return;
      }

      switch (key) {
        case "Backspace":
          e.preventDefault();
          actions.deleteLetter();
          break;
        case "ArrowUp":
          e.preventDefault();
          actions.moveSelection(-1, 0);
          break;
        case "ArrowDown":
          e.preventDefault();
          actions.moveSelection(1, 0);
          break;
        case "ArrowLeft":
          e.preventDefault();
          actions.moveSelection(0, -1);
          break;
        case "ArrowRight":
          e.preventDefault();
          actions.moveSelection(0, 1);
          break;
        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            actions.prevWord();
          } else {
            actions.nextWord();
          }
          break;
        case " ":
          e.preventDefault();
          actions.toggleDirection();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions]);
}
