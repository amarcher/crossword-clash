// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
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

/**
 * The phone play screen: the grid inside a scroller, the keyboard covering the
 * bottom of the screen (a fake visualViewport) and the fixed clue bar above
 * it. jsdom lays nothing out, so each element's box is scripted.
 */
describe("CrosswordGrid keeps the active cell in view", () => {
  const boxes = new Map<string, { top: number; bottom: number }>();
  let scroller: HTMLElement;

  beforeEach(() => {
    boxes.clear();
    Object.defineProperty(window, "visualViewport", { value: { height: 500, offsetTop: 0, addEventListener: () => undefined, removeEventListener: () => undefined }, configurable: true });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const key = this.tagName === "MAIN" ? "scroller" : this.id;
      const box = boxes.get(key) ?? { top: 0, bottom: 0 };
      return { ...box, left: 0, right: 0, width: 0, height: box.bottom - box.top, x: 0, y: box.top, toJSON: () => ({}) } as DOMRect;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
  });

  function renderInScroller(selected: { row: number; col: number }) {
    const nav = actions();
    const grid = (sel: { row: number; col: number }) => (
      <main style={{ overflowY: "auto" }}>
        <CrosswordGrid puzzle={makePuzzle()} playerCells={{}} selectedCell={sel} highlightedCells={new Set()} onCellClick={vi.fn()} navigationActions={nav} />
      </main>
    );
    const utils = render(grid(selected));
    scroller = utils.container.querySelector("main")!;
    // jsdom's scrollTop is inert; a plain writable property records the effect's scroll.
    Object.defineProperty(scroller, "scrollTop", { value: 0, writable: true, configurable: true });
    const shell = utils.container.querySelector(".grid-shell") as HTMLElement;
    shell.style.setProperty("--clue-bar-height", "48px");
    boxes.set("scroller", { top: 60, bottom: 900 });
    return { ...utils, nav, rerender: (sel: { row: number; col: number }) => utils.rerender(grid(sel)) };
  }

  it("scrolls by exactly the overshoot when the selection moves to a row under the clue bar, and not at all for a visible cell", () => {
    const { rerender } = renderInScroller({ row: 0, col: 0 });
    const idOf = (name: string) => screen.getByRole("gridcell", { name }).id;
    boxes.set(idOf("Row 1, Column 1, 1"), { top: 80, bottom: 120 });
    boxes.set(idOf("Row 1, Column 2"), { top: 80, bottom: 120 });
    boxes.set(idOf("Row 3, Column 2"), { top: 700, bottom: 740 });
    // A visible cell: nothing moves.
    rerender({ row: 0, col: 1 });
    expect(scroller.scrollTop).toBe(0);
    // Visible band ends at the keyboard (500) minus the clue bar (48) = 452; the cell's bottom is 740.
    rerender({ row: 2, col: 1 });
    expect(scroller.scrollTop).toBe(740 - 452 + 8);
  });

  it("does nothing without a scroller (the apps' grid slot)", () => {
    const { rerender } = renderGrid({ row: 0, col: 0 });
    boxes.set(screen.getByRole("gridcell", { name: "Row 3, Column 2" }).id, { top: 700, bottom: 740 });
    expect(() =>
      rerender(<CrosswordGrid puzzle={makePuzzle()} playerCells={{}} selectedCell={{ row: 2, col: 1 }} highlightedCells={new Set()} onCellClick={vi.fn()} navigationActions={actions()} />),
    ).not.toThrow();
  });

  it("parks the hidden input on the active cell so the browser's own focus scroll agrees", () => {
    const { input, rerender, nav } = renderGrid({ row: 2, col: 1 });
    expect(parseFloat(input.style.top)).toBeCloseTo((2.5 / 3) * 100, 5);
    expect(input.style.left).toBe("50%");
    rerender(<CrosswordGrid puzzle={makePuzzle()} playerCells={{}} selectedCell={null} highlightedCells={new Set()} onCellClick={vi.fn()} navigationActions={nav} />);
    expect(input.style.top).toBe("50%");
  });
});
