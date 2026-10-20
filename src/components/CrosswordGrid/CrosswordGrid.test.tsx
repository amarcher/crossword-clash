// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CrosswordGrid, type NavigationActions } from "./CrosswordGrid";
import type { Puzzle } from "../../types/puzzle";
import { GRID_INPUT_SENTINEL } from "../../hooks/useHiddenGridInput";

afterEach(cleanup);

function makePuzzle(): Puzzle {
  return {
    title: "Test",
    author: "Test",
    width: 3,
    height: 3,
    cells: [
      [
        { row: 0, col: 0, solution: "C", number: 1 },
        { row: 0, col: 1, solution: "A" },
        { row: 0, col: 2, solution: "T", number: 2 },
      ],
      [
        { row: 1, col: 0, solution: "A" },
        { row: 1, col: 1, solution: null },
        { row: 1, col: 2, solution: "O" },
      ],
      [
        { row: 2, col: 0, solution: "B", number: 3 },
        { row: 2, col: 1, solution: "E" },
        { row: 2, col: 2, solution: "T" },
      ],
    ],
    clues: [
      { direction: "across", number: 1, text: "Feline", row: 0, col: 0, length: 3, answer: "CAT" },
      { direction: "across", number: 3, text: "Wager", row: 2, col: 0, length: 3, answer: "BET" },
      { direction: "down", number: 1, text: "Taxi", row: 0, col: 0, length: 3, answer: "CAB" },
      { direction: "down", number: 2, text: "Digit", row: 0, col: 2, length: 3, answer: "TOT" },
    ],
  };
}

function actions(): NavigationActions {
  return {
    inputLetter: vi.fn(),
    deleteLetter: vi.fn(),
    moveSelection: vi.fn(),
    nextWord: vi.fn(),
    prevWord: vi.fn(),
    toggleDirection: vi.fn(),
  };
}

function renderGrid(selected: { row: number; col: number } | null, nav = actions()) {
  const utils = render(
    <CrosswordGrid
      puzzle={makePuzzle()}
      playerCells={{}}
      selectedCell={selected}
      highlightedCells={new Set(["0,0", "0,1", "0,2"])}
      onCellClick={vi.fn()}
      navigationActions={nav}
    />,
  );
  return { ...utils, nav, input: screen.getByLabelText("Crossword input", { selector: "input" }) as HTMLInputElement };
}

describe("CrosswordGrid announcement", () => {
  it("points the hidden input's aria-activedescendant at the cursor cell", () => {
    const { input } = renderGrid({ row: 0, col: 2 });
    const cursor = screen.getByRole("gridcell", { name: "Row 1, Column 3, 2" });
    expect(cursor.id).not.toBe("");
    expect(input.getAttribute("aria-activedescendant")).toBe(cursor.id);
    expect(cursor.getAttribute("aria-selected")).toBe("true");
  });

  it("owns the grid through aria-controls so the descendant is in scope", () => {
    const { input } = renderGrid({ row: 0, col: 0 });
    const grid = screen.getByRole("grid");
    expect(grid.id).not.toBe("");
    expect(input.getAttribute("aria-controls")).toBe(grid.id);
  });

  it("follows the cursor as the selection moves", () => {
    const { input, rerender, nav } = renderGrid({ row: 0, col: 0 });
    const first = input.getAttribute("aria-activedescendant");
    rerender(
      <CrosswordGrid
        puzzle={makePuzzle()}
        playerCells={{}}
        selectedCell={{ row: 2, col: 1 }}
        highlightedCells={new Set()}
        onCellClick={vi.fn()}
        navigationActions={nav}
      />,
    );
    const next = input.getAttribute("aria-activedescendant");
    expect(next).not.toBe(first);
    expect(next).toBe(screen.getByRole("gridcell", { name: "Row 3, Column 2" }).id);
  });

  it("drops the descendant when nothing is selected", () => {
    const { input } = renderGrid(null);
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("wraps the grid in the focus shell and keeps the input at 16px with the sentinel", () => {
    const { input } = renderGrid({ row: 0, col: 0 });
    expect(screen.getByRole("grid").parentElement!.className).toContain("grid-shell");
    expect(input.style.fontSize).toBe("16px");
    expect(input.value).toBe(GRID_INPUT_SENTINEL);
  });

  it("drives the navigation actions from the hidden input", () => {
    const { input, nav } = renderGrid({ row: 0, col: 0 });
    fireEvent.keyDown(input, { key: "x" });
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    fireEvent.change(input, { target: { value: "" } });
    expect(nav.inputLetter).toHaveBeenCalledWith("x");
    expect(nav.prevWord).toHaveBeenCalledTimes(1);
    expect(nav.deleteLetter).toHaveBeenCalledTimes(1);
  });

  it("renders no hidden input for a read-only grid", () => {
    render(
      <CrosswordGrid
        puzzle={makePuzzle()}
        playerCells={{}}
        selectedCell={null}
        highlightedCells={new Set()}
        onCellClick={vi.fn()}
        interactive={false}
      />,
    );
    expect(screen.queryByLabelText("Crossword input", { selector: "input" })).toBeNull();
  });
});
