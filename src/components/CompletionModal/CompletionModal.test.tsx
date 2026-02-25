// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { CompletionModal } from "./CompletionModal";
import type { PlayerResult } from "./CompletionModal";

afterEach(cleanup);

const SOLO_PROPS = {
  open: true,
  totalCells: 8,
  totalClues: 4,
  soloScore: 8,
} as const;

function makePlayers(): PlayerResult[] {
  return [
    { userId: "alice", displayName: "Alice", color: "#3b82f6", cellsClaimed: 5, cluesCompleted: 2 },
    { userId: "bob", displayName: "Bob", color: "#ef4444", cellsClaimed: 3, cluesCompleted: 1 },
  ];
}

describe("CompletionModal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <CompletionModal open={false} totalCells={8} totalClues={4} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders solo variant with score", () => {
    const { getByText } = render(<CompletionModal {...SOLO_PROPS} />);
    expect(getByText("Puzzle Complete!")).toBeTruthy();
    expect(getByText("8/8 cells filled")).toBeTruthy();
  });

  it("renders multiplayer variant with winner", () => {
    const { getByText } = render(
      <CompletionModal open={true} totalCells={8} totalClues={4} players={makePlayers()} />,
    );
    expect(getByText("Alice wins!")).toBeTruthy();
    expect(getByText("Alice")).toBeTruthy();
    expect(getByText("Bob")).toBeTruthy();
  });

  it("shows tie message when scores are equal", () => {
    const players = makePlayers();
    players[1].cellsClaimed = 5; // Same as Alice
    const { getByText } = render(
      <CompletionModal open={true} totalCells={10} totalClues={4} players={players} />,
    );
    expect(getByText("It's a tie!")).toBeTruthy();
  });

  it("shows player stats in table", () => {
    const { container } = render(
      <CompletionModal open={true} totalCells={8} totalClues={4} players={makePlayers()} />,
    );
    const table = container.querySelector("table");
    expect(table).toBeTruthy();
    // Two player rows in tbody
    const rows = table!.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
  });

  it("calls onNewPuzzle when button clicked", () => {
    const onNewPuzzle = vi.fn();
    const { getByText } = render(
      <CompletionModal {...SOLO_PROPS} onNewPuzzle={onNewPuzzle} />,
    );
    fireEvent.click(getByText("Choose a New Puzzle"));
    expect(onNewPuzzle).toHaveBeenCalledOnce();
  });

  it("calls onBackToMenu when button clicked", () => {
    const onBackToMenu = vi.fn();
    const { getByText } = render(
      <CompletionModal {...SOLO_PROPS} onBackToMenu={onBackToMenu} />,
    );
    fireEvent.click(getByText("Back to Menu"));
    expect(onBackToMenu).toHaveBeenCalledOnce();
  });

  it("hides new puzzle button when onNewPuzzle is undefined", () => {
    const { queryByText } = render(
      <CompletionModal
        open={true}
        totalCells={8}
        totalClues={4}
        onNewPuzzle={undefined}
        onBackToMenu={() => {}}
      />,
    );
    expect(queryByText("Choose a New Puzzle")).toBeNull();
  });

  it("applies dark mode classes when darkMode is true", () => {
    const { container } = render(
      <CompletionModal {...SOLO_PROPS} darkMode />,
    );
    const dialog = container.querySelector("[role='dialog']");
    expect(dialog?.className).toContain("bg-neutral-800");
  });

  it("applies light mode classes by default", () => {
    const { container } = render(
      <CompletionModal {...SOLO_PROPS} />,
    );
    const dialog = container.querySelector("[role='dialog']");
    expect(dialog?.className).toContain("bg-white");
  });

  it("renders confetti particles", () => {
    const { container } = render(<CompletionModal {...SOLO_PROPS} />);
    const particles = container.querySelectorAll(".confetti-particle");
    expect(particles.length).toBeGreaterThan(0);
  });
});
