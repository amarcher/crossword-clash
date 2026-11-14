// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, fireEvent, cleanup, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { PuzzleReady } from "./PuzzleReady";
import type { Puzzle } from "../../types/puzzle";

// The shared site bar's logo is a router Link, so the screen needs a router around it.
const render = (ui: ReactElement, options?: RenderOptions) => rtlRender(ui, { wrapper: MemoryRouter, ...options });

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

  it("shows the NYT return-loop hook only for bookmarklet imports", () => {
    const base = { onPlaySolo: vi.fn(), onHostGame: vi.fn(), onHostOnTV: vi.fn(), showHostOptions: false };
    const { queryByText, rerender, getByText } = render(<PuzzleReady puzzle={makePuzzle()} {...base} />);
    expect(getByText("Puzzle imported")).toBeTruthy();
    expect(queryByText(/click the bookmark again/)).toBeNull();

    rerender(<PuzzleReady puzzle={{ ...makePuzzle(), origin: "nyt-bookmarklet" }} {...base} />);
    expect(getByText("Imported from NYT")).toBeTruthy();
    expect(getByText(/click the bookmark again/)).toBeTruthy();
    expect(queryByText(/NYT streak/)).toBeNull();

    rerender(<PuzzleReady puzzle={{ ...makePuzzle(), origin: "nyt-bookmarklet" }} {...base} nytStreak={5} />);
    expect(getByText("5-day NYT streak!")).toBeTruthy();
  });
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

  it("calls onPlaySolo when Play solo is clicked", () => {
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

    fireEvent.click(screen.getByText("Play solo"));
    expect(onPlaySolo).toHaveBeenCalledOnce();
  });

  it("calls onHostGame when Start a room is clicked", () => {
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

    fireEvent.click(screen.getByText("Start a room"));
    expect(onHostGame).toHaveBeenCalledOnce();
  });

  it("calls onHostOnTV when Start a room on a TV is clicked", () => {
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

    fireEvent.click(screen.getByText("Start a room on a TV"));
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

    expect(screen.getByText("Play solo")).toBeTruthy();
    expect(screen.queryByText("Start a room")).toBeNull();
    expect(screen.queryByText("Start a room on a TV")).toBeNull();
  });
});
