// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import "../../i18n/i18n";
import type { Puzzle } from "../../types/puzzle";
import { puzzleIdentity } from "../../lib/soloStats";

/** The TV chooser's daily tiles: what a signed-in host has finished says so. */
const puzzle = (title: string): Puzzle => ({
  title, author: "", width: 2, height: 2,
  cells: [
    [{ row: 0, col: 0, solution: title[0], number: 1 }, { row: 0, col: 1, solution: "B" }],
    [{ row: 1, col: 0, solution: "C" }, { row: 1, col: 1, solution: null }],
  ],
  clues: [{ direction: "across", number: 1, text: "", row: 0, col: 0, length: 2, answer: `${title[0]}B` }],
});
const mini = puzzle("Mini one");
const midi = puzzle("Midi two");
const large = puzzle("Large three");
const state = vi.hoisted(() => ({ user: null as { id: string; is_anonymous: boolean } | null, history: null as unknown, device: {} as Record<string, number> }));
vi.mock("../../hooks/useNextUp", () => ({ useTodaysDailies: () => ({ mini: { puzzle: mini }, midi: { puzzle: midi }, large: { puzzle: large } }) }));
vi.mock("../../layouts/HostLayout", () => ({ useHostContext: () => ({ user: state.user }) }));
vi.mock("../../hooks/useSolveHistory", () => ({ useBestTimes: () => state.device }));
vi.mock("../../lib/solveHistory", () => ({ ensureSolveHistory: vi.fn(async () => {}), getSolveHistoryState: () => state.history, subscribeSolveHistory: () => () => {} }));
vi.mock("../../lib/analytics", () => ({ track: vi.fn() }));

import { TVPuzzleSources } from "./TVPuzzleSources";
import { ensureSolveHistory } from "../../lib/solveHistory";

const show = () => render(<MemoryRouter><TVPuzzleSources onPick={() => {}} /></MemoryRouter>);

afterEach(() => {
  cleanup();
  state.user = null;
  state.history = null;
  state.device = {};
  vi.clearAllMocks();
});

describe("the TV chooser's daily tiles", () => {
  it("a signed-in host sees a solved daily's time and a raced daily's finish; the rest keep their size line", () => {
    state.user = { id: "u1", is_anonymous: false };
    state.history = {
      userId: "u1", status: "ready",
      rows: [{ puzzle_key: puzzleIdentity(midi), mode: "versus" }],
      summary: { bestTimes: { [puzzleIdentity(mini)]: 84 } },
    };
    show();
    expect(ensureSolveHistory).toHaveBeenCalledWith("u1");
    expect(screen.getByText("Solved in 1:24")).toBeTruthy();
    expect(screen.getByText("Finished in a race")).toBeTruthy();
    expect(screen.getAllByText("2×2 · 1 clues")).toHaveLength(1);
  });

  it("without an account the device's own times are used and no history is asked for", () => {
    state.user = { id: "anon", is_anonymous: true };
    state.device = { [puzzleIdentity(large)]: 300 };
    show();
    expect(ensureSolveHistory).not.toHaveBeenCalled();
    expect(screen.getByText("Solved in 5:00")).toBeTruthy();
    expect(screen.getAllByText("2×2 · 1 clues")).toHaveLength(2);
  });
});
