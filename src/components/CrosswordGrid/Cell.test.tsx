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
    expect(container.firstElementChild!.className).toContain("bg-ink");
  });

  it("renders a white cell with number and no letter", () => {
    render(
      <Cell cell={whiteCell()} isSelected={false} isHighlighted={false} />,
    );
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.queryByText("A")).toBeNull();
  });

  it("renders letter in ink when cell has state", () => {
    const state: CellState = { letter: "A", correct: true };
    const { container } = render(
      <Cell cell={whiteCell()} cellState={state} isSelected={false} isHighlighted={false} />,
    );
    const letterSpan = screen.getByText("A");
    expect(letterSpan.className).toContain("text-ink");
    // Cell background should be the plain surface (no player color)
    expect(container.firstElementChild!.className).toContain("bg-surface");
  });

  it("fills the cursor cell gold-400 with no outline", () => {
    const { container } = render(
      <Cell cell={whiteCell()} isSelected={true} isHighlighted={false} />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("bg-gold-400");
    expect(el.style.outline).toBe("");
  });

  it("fills active-word cells gold-100 with no outline", () => {
    const { container } = render(
      <Cell cell={whiteCell()} isSelected={false} isHighlighted={true} />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("bg-gold-100");
    expect(el.style.outline).toBe("");
    expect(el.style.boxShadow).toBe("");
  });

  it("selected takes priority over highlighted", () => {
    const { container } = render(
      <Cell cell={whiteCell()} isSelected={true} isHighlighted={true} />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("bg-gold-400");
    expect(el.className).not.toContain("bg-gold-100");
    expect(el.style.outline).toBe("");
  });

  it("puts the fill pop on the letter span, not the cell", () => {
    const state: CellState = { letter: "A", correct: true, playerId: "p2" };
    const { container } = render(
      <Cell cell={whiteCell()} cellState={state} isSelected={false} isHighlighted={false} animateFill />,
    );
    expect(container.firstElementChild!.className).not.toContain("cell-fill");
    expect(container.querySelector("span.cell-fill")?.textContent).toBe("A");
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
    // Should NOT have bg-surface (replaced by inline style)
    expect(el.className).not.toContain("bg-surface");
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
    expect(el.className).toContain("bg-gold-400");
    expect(el.style.backgroundColor).toBe("");
    expect(el.style.outline).toBe("");
  });

  it("lays the word highlight over a player's tint instead of replacing it", () => {
    const state: CellState = { letter: "A", correct: true, playerId: "p1" };
    const colorMap = { p1: "#3b82f6" };
    const plain = render(
      <Cell cell={whiteCell()} cellState={state} isSelected={false} isHighlighted={false} playerColorMap={colorMap} />,
    );
    const tint = (plain.container.firstElementChild as HTMLElement).style.backgroundColor;
    plain.unmount();

    const { container } = render(
      <Cell cell={whiteCell()} cellState={state} isSelected={false} isHighlighted={true} playerColorMap={colorMap} />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).not.toContain("bg-gold-100");
    expect(el.style.outline).toBe("");
    const over = el.style.backgroundColor;
    expect(over).toMatch(/^rgb\(/);
    expect(over).not.toBe(tint);
    // Gold over a blue tint: the blue channel drops and red now leads blue.
    const [, , tb] = tint.match(/\d+/g)!.map(Number);
    const [or, , ob] = over.match(/\d+/g)!.map(Number);
    expect(ob).toBeLessThan(tb);
    expect(or).toBeGreaterThan(ob);
  });

  it("non-highlighted non-selected cell has no outline", () => {
    const { container } = render(
      <Cell cell={whiteCell()} isSelected={false} isHighlighted={false} />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.outline).toBe("");
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

  it("renders cell number in text-ink-soft", () => {
    render(
      <Cell cell={whiteCell({ number: 42 })} isSelected={false} isHighlighted={false} />,
    );
    const numberSpan = screen.getByText("42");
    expect(numberSpan.className).toContain("text-ink-soft");
  });
});
