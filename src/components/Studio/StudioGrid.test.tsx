// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { LONG_PRESS_MS, StudioGrid } from "./StudioGrid";
import { gridFromRows } from "../../lib/seedgrid/grid";
import type { HiddenGridInputHandlers } from "../../hooks/useHiddenGridInput";

afterEach(cleanup);

function input(): HiddenGridInputHandlers {
  return { onLetter: vi.fn(), onErase: vi.fn(), onMove: vi.fn(), onToggleDirection: vi.fn(), onToggleBlock: vi.fn() };
}

// 5×5 with a block in the middle row.
const grid = gridFromRows(["CAT..", "A..U.", ".#..N", "..R..", "....S"]);

function renderGrid(cursor: number, direction: "across" | "down" = "across", handlers = input()) {
  const onToggleBlock = vi.fn();
  const onToggleDirection = vi.fn();
  const onShowWords = vi.fn();
  const onSelect = vi.fn();
  const utils = render(
    <StudioGrid grid={grid} cursor={cursor} direction={direction} activeCells={[0, 1, 2]} onSelect={onSelect} onToggleBlock={onToggleBlock} onToggleDirection={onToggleDirection} onShowWords={onShowWords} input={handlers} />,
  );
  return { ...utils, handlers, onToggleBlock, onToggleDirection, onShowWords, onSelect, hidden: screen.getByLabelText("Grid entry") as HTMLInputElement };
}

describe("StudioGrid block cursor", () => {
  it("draws a plain gold disc when the cursor sits on a block: no direction glyph, there is no word through a block", () => {
    renderGrid(11, "across");
    const block = screen.getByRole("gridcell", { name: "Row 3, Column 2, block" });
    expect(block.className).toContain("outline-gold-400");
    const cue = screen.getByTestId("block-cursor");
    expect(block.contains(cue)).toBe(true);
    expect(cue.className).toContain("bg-gold-400");
    expect(cue.className).toContain("rounded-full");
    expect(cue.textContent).toBe("");
  });

  it("shows no cue on a block the cursor is not on", () => {
    renderGrid(0);
    expect(screen.queryByTestId("block-cursor")).toBeNull();
    expect(screen.getByRole("gridcell", { name: "Row 3, Column 2, block" }).className).not.toContain("outline-gold-400");
  });
});

describe("StudioGrid right-click menu", () => {
  it("offers to make a white square black, selecting it first", () => {
    const { onToggleBlock, onSelect } = renderGrid(0);
    fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^Row 1, Column 4/ }));
    expect(onSelect).toHaveBeenCalledWith(3);
    const menu = screen.getByRole("menu", { name: "Square" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Make this square black" }));
    expect(onToggleBlock).toHaveBeenCalledWith(3);
    expect(menu.isConnected).toBe(false);
  });

  it("offers to make a block white again, and to switch direction", () => {
    const { onToggleBlock, onToggleDirection } = renderGrid(0, "across");
    fireEvent.contextMenu(screen.getByRole("gridcell", { name: "Row 3, Column 2, block" }));
    expect(screen.getByRole("menuitem", { name: "Make this square white" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Write down ▾" }));
    expect(onToggleDirection).toHaveBeenCalled();
    expect(onToggleBlock).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("lists the entries through the square and hands one to onShowWords", () => {
    const { onShowWords } = renderGrid(0);
    // Row 1, Column 1 ("C") starts 1 Across and 1 Down.
    fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^Row 1, Column 1/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Words for 1 Down" }));
    expect(onShowWords).toHaveBeenCalledWith(0, "down");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on a long press with a finger, and the release does not close it or select again", () => {
    vi.useFakeTimers();
    try {
      const { onSelect } = renderGrid(0);
      const cell = screen.getByRole("gridcell", { name: /^Row 1, Column 4/ });
      fireEvent.pointerDown(cell, { pointerType: "touch", clientX: 50, clientY: 50 });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS + 10);
      });
      expect(screen.getByRole("menu", { name: "Square" })).toBeTruthy();
      expect(onSelect).toHaveBeenCalledWith(3);
      fireEvent.pointerUp(cell, { pointerType: "touch" });
      fireEvent.click(cell);
      expect(screen.getByRole("menu")).toBeTruthy();
      expect(onSelect).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not open on a short tap or a drag", () => {
    vi.useFakeTimers();
    try {
      renderGrid(0);
      const cell = screen.getByRole("gridcell", { name: /^Row 1, Column 4/ });
      fireEvent.pointerDown(cell, { pointerType: "touch", clientX: 50, clientY: 50 });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS / 2);
      });
      fireEvent.pointerUp(cell, { pointerType: "touch" });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      expect(screen.queryByRole("menu")).toBeNull();
      fireEvent.pointerDown(cell, { pointerType: "touch", clientX: 50, clientY: 50 });
      fireEvent.pointerMove(cell, { pointerType: "touch", clientX: 80, clientY: 50 });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS + 10);
      });
      expect(screen.queryByRole("menu")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes on Escape", () => {
    renderGrid(0);
    fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^Row 1, Column 4/ }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("StudioGrid announcement and hover", () => {
  it("labels cells and points aria-activedescendant at the cursor", () => {
    const { hidden } = renderGrid(2);
    const cursor = screen.getByRole("gridcell", { name: "Row 1, Column 3, 3, T" });
    expect(cursor.id).not.toBe("");
    expect(hidden.getAttribute("aria-activedescendant")).toBe(cursor.id);
    expect(hidden.getAttribute("aria-controls")).toBe(screen.getByRole("grid").id);
    expect(hidden.style.fontSize).toBe("16px");
  });

  it("tints open cells on hover but never the cursor or active word", () => {
    renderGrid(0);
    const open = screen.getByRole("gridcell", { name: "Row 5, Column 5, S" });
    expect(open.className).toContain("hover:bg-surface-sunken");
    expect(screen.getByRole("gridcell", { name: "Row 1, Column 1, 1, C" }).className).not.toContain("hover:");
    expect(screen.getByRole("gridcell", { name: /^Row 1, Column 2, / }).className).not.toContain("hover:");
  });

  it("drives the handlers from the hidden input, including the Android erase path", () => {
    const { hidden, handlers } = renderGrid(0);
    fireEvent.keyDown(hidden, { key: "." });
    fireEvent.change(hidden, { target: { value: "" } });
    expect(handlers.onToggleBlock).toHaveBeenCalledTimes(1);
    expect(handlers.onErase).toHaveBeenCalledTimes(1);
  });
});
