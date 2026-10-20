// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import type { TransferPuzzle } from "../lib/puzzleNormalizer";

vi.mock("../contexts/GameContext", () => ({ useGame: vi.fn() }));

import { DailyPuzzleScreen } from "./DailyPuzzleScreen";
import { useGame } from "../contexts/GameContext";

const FEED_PUZZLE: TransferPuzzle = {
  title: "Deep Blue",
  author: "Crossword Clash",
  size: { rows: 3, cols: 3 },
  grid: ["C", "A", "T", "A", ".", "O", "B", "E", "T"],
  gridnums: [1, 0, 2, 0, 0, 0, 3, 0, 0],
  clues: { across: ["1. Feline", "3. Wager"], down: ["1. Taxi", "2. Digit"] },
  answers: { across: ["CAT", "BET"], down: ["CAB", "TOT"] },
};

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/daily/:day/:slot" element={<DailyPuzzleScreen />} />
        <Route path="/challenge" element={<div data-testid="challenge-screen" />} />
        <Route path="/puzzle-ready" element={<div data-testid="puzzle-ready-screen" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DailyPuzzleScreen (/daily/:day/:slot)", () => {
  const setUrlPuzzle = vi.fn();
  const setUrlChallenge = vi.fn();
  const fetched: string[] = [];
  let feed: { ok: boolean; status: number; body: unknown };

  beforeEach(() => {
    fetched.length = 0;
    feed = { ok: true, status: 200, body: { theme: "Ocean", puzzle: FEED_PUZZLE } };
    vi.mocked(useGame).mockReturnValue({ setUrlPuzzle, setUrlChallenge } as unknown as ReturnType<typeof useGame>);
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(url);
      return { ok: feed.ok, status: feed.status, json: async () => feed.body };
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setUrlPuzzle.mockClear();
    setUrlChallenge.mockClear();
  });

  it("loads that day's puzzle from the feed and lands on the challenge screen with the ghost", async () => {
    renderAt("/daily/2026-10-20/mini?beat=102&by=Archer");
    expect(screen.getByRole("status").textContent).toContain("Daily Mini");
    await waitFor(() => expect(screen.getByTestId("challenge-screen")).toBeTruthy());
    expect(fetched).toEqual(["/daily-puzzles/2026-10-20.json"]);
    expect(setUrlPuzzle).toHaveBeenCalledTimes(1);
    expect(setUrlPuzzle.mock.calls[0][0].title).toBe("Deep Blue");
    expect(setUrlChallenge).toHaveBeenCalledWith({ name: "Archer", seconds: 102 });
  });

  it("reads the slot from the path and signs an anonymous ghost as 'A friend'", async () => {
    renderAt("/daily/2026-10-20/large?beat=600");
    await waitFor(() => expect(screen.getByTestId("challenge-screen")).toBeTruthy());
    expect(fetched).toEqual(["/daily-puzzles/large/2026-10-20.json"]);
    expect(setUrlChallenge).toHaveBeenCalledWith({ name: "A friend", seconds: 600 });
  });

  it("goes to the plain puzzle-ready screen when the link carries no time", async () => {
    renderAt("/daily/2026-10-20/midi");
    await waitFor(() => expect(screen.getByTestId("puzzle-ready-screen")).toBeTruthy());
    expect(setUrlChallenge).toHaveBeenCalledWith(null);
  });

  it("falls back to the bundled rotation for a mini the feed does not have", async () => {
    feed = { ok: false, status: 404, body: null };
    renderAt("/daily/2026-10-20/mini?beat=90");
    await waitFor(() => expect(screen.getByTestId("challenge-screen")).toBeTruthy());
    expect(setUrlPuzzle.mock.calls[0][0].width).toBeGreaterThan(0);
  });

  it("says when a midi or large was never published that day", async () => {
    feed = { ok: false, status: 404, body: null };
    renderAt("/daily/2026-10-20/large");
    await waitFor(() => expect(screen.getByRole("heading").textContent).toContain("No Daily Large for Oct 20"));
    expect(setUrlPuzzle).not.toHaveBeenCalled();
  });

  it("is a not-found page for a malformed day or an unknown slot, without touching the feed", () => {
    renderAt("/daily/leaderboard/mini");
    expect(screen.getByText("Page not found")).toBeTruthy();
    cleanup();
    renderAt("/daily/2026-10-20/huge");
    expect(screen.getByText("Page not found")).toBeTruthy();
    expect(fetched).toHaveLength(0);
  });
});
