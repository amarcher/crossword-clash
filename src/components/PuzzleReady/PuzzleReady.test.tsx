// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PuzzleReady } from "./PuzzleReady";
import type { Puzzle } from "../../types/puzzle";

function makePuzzle(): Puzzle {
  return {
    title: "Monday Special",
    author: "Jane Doe",
    width: 15,
    height: 15,
    cells: Array.from({ length: 15 }, (_, r) =>
      Array.from({ length: 15 }, (_, c) => ({
        row: r,
        col: c,
        solution: "A",
      })),
    ),
    clues: [
      ...Array.from({ length: 30 }, (_, i) => ({
        direction: "across" as const,
        number: i + 1,
        text: `Across clue ${i + 1}`,
        row: 0,
        col: 0,
        length: 5,
        answer: "AAAAA",
      })),
      ...Array.from({ length: 28 }, (_, i) => ({
        direction: "down" as const,
        number: i + 1,
        text: `Down clue ${i + 1}`,
        row: 0,
        col: 0,
        length: 5,
        answer: "AAAAA",
      })),
    ],
  };
}

describe("PuzzleReady", () => {
  afterEach(cleanup);
  it("renders puzzle title and author", () => {
    render(
      <PuzzleReady
        puzzle={makePuzzle()}
        onPlaySolo={() => {}}
        onHostGame={() => {}}
        onHostOnTV={() => {}}
        showHostOptions
      />,
    );

    expect(screen.getByText("Monday Special")).toBeTruthy();
    expect(screen.getByText("by Jane Doe")).toBeTruthy();
  });

  it("renders puzzle dimensions and clue counts", () => {
    render(
      <PuzzleReady
        puzzle={makePuzzle()}
        onPlaySolo={() => {}}
        onHostGame={() => {}}
        onHostOnTV={() => {}}
        showHostOptions
      />,
    );

    // The × is rendered as &times; in HTML
    expect(screen.getByText(/15.*15.*30 across.*28 down/)).toBeTruthy();
  });

  it("calls onPlaySolo when Play Solo is clicked", () => {
    const onPlaySolo = vi.fn();
    render(
      <PuzzleReady
        puzzle={makePuzzle()}
        onPlaySolo={onPlaySolo}
        onHostGame={() => {}}
        onHostOnTV={() => {}}
        showHostOptions
      />,
    );

    fireEvent.click(screen.getByText("Play Solo"));
    expect(onPlaySolo).toHaveBeenCalledOnce();
  });

  it("calls onHostGame when Host Game as Player is clicked", () => {
    const onHostGame = vi.fn();
    render(
      <PuzzleReady
        puzzle={makePuzzle()}
        onPlaySolo={() => {}}
        onHostGame={onHostGame}
        onHostOnTV={() => {}}
        showHostOptions
      />,
    );

    fireEvent.click(screen.getByText("Host Game as Player"));
    expect(onHostGame).toHaveBeenCalledOnce();
  });

  it("calls onHostOnTV when Host Game as TV is clicked", () => {
    const onHostOnTV = vi.fn();
    render(
      <PuzzleReady
        puzzle={makePuzzle()}
        onPlaySolo={() => {}}
        onHostGame={() => {}}
        onHostOnTV={onHostOnTV}
        showHostOptions
      />,
    );

    fireEvent.click(screen.getByText("Host Game as TV"));
    expect(onHostOnTV).toHaveBeenCalledOnce();
  });

  it("hides host options when showHostOptions is false", () => {
    render(
      <PuzzleReady
        puzzle={makePuzzle()}
        onPlaySolo={() => {}}
        onHostGame={() => {}}
        onHostOnTV={() => {}}
        showHostOptions={false}
      />,
    );

    expect(screen.getByText("Play Solo")).toBeTruthy();
    expect(screen.queryByText("Host Game as Player")).toBeNull();
    expect(screen.queryByText("Host Game as TV")).toBeNull();
  });
});
