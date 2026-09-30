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
      const target = e.target instanceof Element ? e.target : null;
      // Ignore if user is typing in an input/textarea
      if (
        e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey ||
        target?.closest('[role="dialog"], [contenteditable="true"]') ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const a = actionsRef.current;
      const key = e.key;
      // Keep keyboard buttons and modal/other controls accessible via Space/Tab.
      if ((key === " " || key === "Tab") && target?.closest("button, a, select")) return;

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
