// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Cell, blendOnWhite } from "./Cell";
import type { PuzzleCell, CellState } from "../../types/puzzle";

function whiteCell(overrides?: Partial<PuzzleCell>): PuzzleCell {
  return { row: 0, col: 0, solution: "A", number: 1, ...overrides };
}

function blackCell(): PuzzleCell {
  return { row: 0, col: 0, solution: null };
}

describe("blendOnWhite", () => {
  it("returns white for alpha 0", () => {
    expect(blendOnWhite("#ff0000", 0)).toBe("rgb(255,255,255)");
  });

  it("returns the original color for alpha 1", () => {
    expect(blendOnWhite("#ff0000", 1)).toBe("rgb(255,0,0)");
  });

  it("blends correctly at 12% alpha", () => {
    // Blue #3b82f6 at 12%:  R = 59*0.12 + 255*0.88 ≈ 231
    const result = blendOnWhite("#3b82f6", 0.12);
    expect(result).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    const [r, g, b] = result.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(220); // light tint
    expect(g).toBeGreaterThan(220);
    expect(b).toBeGreaterThan(240);
  });

  it("produces opaque values (no alpha channel)", () => {
    const result = blendOnWhite("#ef4444", 0.12);
    expect(result).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    expect(result).not.toContain("rgba");
  });
});

describe("Cell", () => {
  it("renders a black cell", () => {
    const { container } = render(
      <Cell cell={blackCell()} isSelected={false} isHighlighted={false} />,
    );
    expect(container.firstElementChild!.className).toContain("bg-black");
  });

  it("renders a white cell with number and no letter", () => {
    render(
      <Cell cell={whiteCell()} isSelected={false} isHighlighted={false} />,
    );
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.queryByText("A")).toBeNull();
  });

  it("renders letter in text-black when cell has state", () => {
    const state: CellState = { letter: "A", correct: true };
    const { container } = render(
      <Cell cell={whiteCell()} cellState={state} isSelected={false} isHighlighted={false} />,
    );
    const letterSpan = screen.getByText("A");
    expect(letterSpan.className).toContain("text-black");
    // Cell background should be white (no player color)
    expect(container.firstElementChild!.className).toContain("bg-white");
  });

  it("applies yellow background when selected", () => {
    const { container } = render(
      <Cell cell={whiteCell()} isSelected={true} isHighlighted={false} />,
    );
    expect(container.firstElementChild!.className).toContain("bg-yellow-200");
  });

  it("applies blue background when highlighted", () => {
    const { container } = render(
      <Cell cell={whiteCell()} isSelected={false} isHighlighted={true} />,
    );
    expect(container.firstElementChild!.className).toContain("bg-blue-50");
  });

  it("selected takes priority over highlighted", () => {
    const { container } = render(
      <Cell cell={whiteCell()} isSelected={true} isHighlighted={true} />,
    );
    expect(container.firstElementChild!.className).toContain("bg-yellow-200");
    expect(container.firstElementChild!.className).not.toContain("bg-blue-50");
  });

  it("applies opaque blended player color as inline style", () => {
    const state: CellState = { letter: "A", correct: true, playerId: "p1" };
    const colorMap = { p1: "#3b82f6" };
    const { container } = render(
      <Cell
        cell={whiteCell()}
        cellState={state}
        isSelected={false}
        isHighlighted={false}
        playerColorMap={colorMap}
      />,
    );
    const el = container.firstElementChild as HTMLElement;
    // Should NOT have bg-white (replaced by inline style)
    expect(el.className).not.toContain("bg-white");
    // Should have an opaque rgb backgroundColor
    expect(el.style.backgroundColor).toMatch(/^rgb\(/);
    expect(el.style.backgroundColor).not.toContain("rgba");
  });

  it("selected overrides player color", () => {
    const state: CellState = { letter: "A", correct: true, playerId: "p1" };
    const colorMap = { p1: "#ef4444" };
    const { container } = render(
      <Cell
        cell={whiteCell()}
        cellState={state}
        isSelected={true}
        isHighlighted={false}
        playerColorMap={colorMap}
      />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("bg-yellow-200");
    expect(el.style.backgroundColor).toBe("");
  });

  it("calls onClick with row and col", () => {
    const onClick = vi.fn();
    const cell = whiteCell({ row: 2, col: 3 });
    const { container } = render(
      <Cell cell={cell} isSelected={false} isHighlighted={false} onClick={onClick} />,
    );
    fireEvent.click(container.firstElementChild!);
    expect(onClick).toHaveBeenCalledWith(2, 3);
  });

  it("does not render cursor-pointer without onClick", () => {
    const { container } = render(
      <Cell cell={whiteCell()} isSelected={false} isHighlighted={false} />,
    );
    expect(container.firstElementChild!.className).not.toContain("cursor-pointer");
  });

  it("renders cell number in text-neutral-800", () => {
    render(
      <Cell cell={whiteCell({ number: 42 })} isSelected={false} isHighlighted={false} />,
    );
    const numberSpan = screen.getByText("42");
    expect(numberSpan.className).toContain("text-neutral-800");
  });
});
