// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CluePanel } from "./CluePanel";
import type { PuzzleClue } from "../../types/puzzle";

function makeTestClues(): PuzzleClue[] {
  return [
    { direction: "across", number: 1, text: "Feline", row: 0, col: 0, length: 3, answer: "CAT" },
    { direction: "across", number: 3, text: "Wager", row: 2, col: 0, length: 3, answer: "BET" },
    { direction: "down", number: 1, text: "Taxi", row: 0, col: 0, length: 3, answer: "CAB" },
    { direction: "down", number: 2, text: "Digit", row: 0, col: 2, length: 3, answer: "TOT" },
  ];
}

describe("CluePanel", () => {
  it("renders across and down sections", () => {
    const { container } = render(
      <CluePanel clues={makeTestClues()} activeClue={null} onClueClick={() => {}} />,
    );
    const headings = container.querySelectorAll("h3");
    expect(headings).toHaveLength(2);
    expect(headings[0].textContent).toBe("Across");
    expect(headings[1].textContent).toBe("Down");
  });

  it("renders all clues", () => {
    const { container } = render(
      <CluePanel clues={makeTestClues()} activeClue={null} onClueClick={() => {}} />,
    );
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(4);
  });

  it("highlights the active clue", () => {
    const clues = makeTestClues();
    const { container } = render(
      <CluePanel clues={clues} activeClue={clues[0]} onClueClick={() => {}} />,
    );
    const items = Array.from(container.querySelectorAll("li"));
    const feline = items.find((li) => li.textContent?.includes("Feline"));
    expect(feline?.className).toContain("bg-blue-100");
  });

  it("calls onClueClick when a clue is clicked", () => {
    const clues = makeTestClues();
    const handler = vi.fn();
    const { container } = render(
      <CluePanel clues={clues} activeClue={null} onClueClick={handler} />,
    );
    const items = Array.from(container.querySelectorAll("li"));
    const wager = items.find((li) => li.textContent?.includes("Wager"))!;
    fireEvent.click(wager);
    expect(handler).toHaveBeenCalledWith(clues[1]);
  });
});

describe("CluePanel strikethrough", () => {
  it("does not show strikethrough when completedClues is not provided", () => {
    const { container } = render(
      <CluePanel clues={makeTestClues()} activeClue={null} onClueClick={() => {}} />,
    );
    container.querySelectorAll("li").forEach((li) => {
      expect(li.className).not.toContain("line-through");
    });
  });

  it("does not show strikethrough with empty completedClues set", () => {
    const { container } = render(
      <CluePanel
        clues={makeTestClues()}
        activeClue={null}
        onClueClick={() => {}}
        completedClues={new Set()}
      />,
    );
    container.querySelectorAll("li").forEach((li) => {
      expect(li.className).not.toContain("line-through");
    });
  });

  it("applies strikethrough to a completed clue", () => {
    const { container } = render(
      <CluePanel
        clues={makeTestClues()}
        activeClue={null}
        onClueClick={() => {}}
        completedClues={new Set(["across-1"])}
      />,
    );
    const items = Array.from(container.querySelectorAll("li"));
    const feline = items.find((li) => li.textContent?.includes("Feline"));
    expect(feline?.className).toContain("line-through");
  });

  it("applies muted text color to a completed clue", () => {
    const { container } = render(
      <CluePanel
        clues={makeTestClues()}
        activeClue={null}
        onClueClick={() => {}}
        completedClues={new Set(["across-1"])}
      />,
    );
    const items = Array.from(container.querySelectorAll("li"));
    const feline = items.find((li) => li.textContent?.includes("Feline"));
    expect(feline?.className).toContain("text-neutral-400");
  });

  it("does not apply strikethrough to incomplete clues", () => {
    const { container } = render(
      <CluePanel
        clues={makeTestClues()}
        activeClue={null}
        onClueClick={() => {}}
        completedClues={new Set(["across-1"])}
      />,
    );
    const items = Array.from(container.querySelectorAll("li"));
    const wager = items.find((li) => li.textContent?.includes("Wager"));
    expect(wager?.className).not.toContain("line-through");
    expect(wager?.className).not.toContain("text-neutral-400");
  });

  it("strikes through multiple completed clues across both directions", () => {
    const { container } = render(
      <CluePanel
        clues={makeTestClues()}
        activeClue={null}
        onClueClick={() => {}}
        completedClues={new Set(["across-1", "down-2"])}
      />,
    );
    const items = Array.from(container.querySelectorAll("li"));
    const feline = items.find((li) => li.textContent?.includes("Feline"));
    const digit = items.find((li) => li.textContent?.includes("Digit"));
    const taxi = items.find((li) => li.textContent?.includes("Taxi"));

    expect(feline?.className).toContain("line-through");
    expect(digit?.className).toContain("line-through");
    expect(taxi?.className).not.toContain("line-through");
  });

  it("preserves active styling alongside strikethrough when clue is both active and completed", () => {
    const clues = makeTestClues();
    const { container } = render(
      <CluePanel
        clues={clues}
        activeClue={clues[0]}
        onClueClick={() => {}}
        completedClues={new Set(["across-1"])}
      />,
    );
    const items = Array.from(container.querySelectorAll("li"));
    const feline = items.find((li) => li.textContent?.includes("Feline"));
    expect(feline?.className).toContain("bg-blue-100");
    expect(feline?.className).toContain("line-through");
  });

  it("completed clue is still clickable", () => {
    const handler = vi.fn();
    const clues = makeTestClues();
    const { container } = render(
      <CluePanel
        clues={clues}
        activeClue={null}
        onClueClick={handler}
        completedClues={new Set(["across-1"])}
      />,
    );
    const items = Array.from(container.querySelectorAll("li"));
    const feline = items.find((li) => li.textContent?.includes("Feline"))!;
    fireEvent.click(feline);
    expect(handler).toHaveBeenCalledWith(clues[0]);
  });
});
