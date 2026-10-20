// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { StudioGrid } from "./StudioGrid";
import { gridFromRows } from "../../lib/seedgrid/grid";
import type { HiddenGridInputHandlers } from "../../hooks/useHiddenGridInput";

afterEach(cleanup);

function input(): HiddenGridInputHandlers {
  return { onLetter: vi.fn(), onErase: vi.fn(), onMove: vi.fn(), onToggleDirection: vi.fn(), onToggleBlock: vi.fn() };
}

// 5×5 with a block in the middle row.
const grid = gridFromRows(["CAT..", "A..U.", ".#..N", "..R..", "....S"]);

function renderGrid(cursor: number, direction: "across" | "down" = "across", handlers = input()) {
  const utils = render(
    <StudioGrid grid={grid} cursor={cursor} direction={direction} activeCells={[0, 1, 2]} onSelect={vi.fn()} input={handlers} />,
  );
  return { ...utils, handlers, hidden: screen.getByLabelText("Grid entry") as HTMLInputElement };
}

describe("StudioGrid block cursor", () => {
  it("draws a gold disc with the across glyph when the cursor sits on a block", () => {
    renderGrid(11, "across");
    const block = screen.getByRole("gridcell", { name: "Row 3, Column 2, block" });
    expect(block.className).toContain("outline-gold-400");
    const cue = screen.getByTestId("block-cursor");
    expect(block.contains(cue)).toBe(true);
    expect(cue.className).toContain("bg-gold-400");
    expect(cue.className).toContain("rounded-full");
    expect(cue.textContent).toBe("▸");
  });

  it("flips the glyph for down", () => {
    renderGrid(11, "down");
    expect(screen.getByTestId("block-cursor").textContent).toBe("▾");
  });

  it("shows no cue on a block the cursor is not on", () => {
    renderGrid(0);
    expect(screen.queryByTestId("block-cursor")).toBeNull();
    expect(screen.getByRole("gridcell", { name: "Row 3, Column 2, block" }).className).not.toContain("outline-gold-400");
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
