// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import type { Puzzle } from "../types/puzzle";
import { puzzleIdentity } from "../lib/soloStats";

/** The menu's daily tile alone: what it says for an unsolved, a solved and a re-attempted daily. */
const state = vi.hoisted(() => ({ best: {} as Record<string, number>, progress: {} as Record<string, { filled: number }> }));
vi.mock("../lib/supabaseClient", () => ({ supabase: null }));
vi.mock("../hooks/useSolveHistory", () => ({ useBestTimes: () => state.best, useStreaks: () => ({ daily: 0, nyt: 0 }) }));
vi.mock("../hooks/useSoloProgress", () => ({ useSoloProgress: () => state.progress }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));

import { DailyHero } from "./MenuScreen";

const puzzle: Puzzle = {
  title: "Liftoff", author: "", width: 2, height: 2,
  cells: [
    [{ row: 0, col: 0, solution: "A", number: 1 }, { row: 0, col: 1, solution: "B" }],
    [{ row: 1, col: 0, solution: "C" }, { row: 1, col: 1, solution: null }],
  ],
  clues: [{ direction: "across", number: 1, text: "", row: 0, col: 0, length: 2, answer: "AB" }],
};
const key = puzzleIdentity(puzzle);
const tile = () =>
  render(
    <MemoryRouter>
      <DailyHero slot="mini" daily={{ puzzle } as never} multiplayer={false} disabled={false} onPlay={() => {}} onRace={() => {}} />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  state.best = {};
  state.progress = {};
});

describe("the menu's daily tile", () => {
  it("unsolved: the size line, an empty thumbnail and Play", () => {
    const { container } = tile();
    expect(screen.getByText("2×2 · 1 clues")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Daily Mini" }).hasAttribute("data-solved")).toBe(false);
    expect(container.querySelector("[data-solved]")).toBeNull();
  });

  it("solved: says so with the time, fills the thumbnail, tints the tile, and Play becomes View", () => {
    state.best = { [key]: 84 };
    const { container } = tile();
    expect(screen.getByText("Solved in 1:24")).toBeTruthy();
    expect(screen.queryByText("2×2 · 1 clues")).toBeNull();
    const region = screen.getByRole("region", { name: "Daily Mini" });
    expect(region.getAttribute("data-solved")).toBe("true");
    expect(region.className).toContain("bg-brand-50!");
    // No left-edge accent: the state is the fill, the check and the words.
    expect(region.className).not.toMatch(/border-l-|border-left/);
    const thumb = container.querySelector('[aria-hidden="true"][data-solved]')!;
    expect(thumb.querySelectorAll(".bg-brand-200")).toHaveLength(3);
    expect(thumb.textContent).toBe(""); // no numbers, no letters
    expect(screen.getByRole("button", { name: "View" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("solved and being solved again: Resume once the new attempt has a letter, View while it has none", () => {
    state.best = { [key]: 84 };
    state.progress = { [key]: { filled: 0 } };
    tile();
    expect(screen.getByRole("button", { name: "View" })).toBeTruthy();
    cleanup();
    state.progress = { [key]: { filled: 2 } };
    tile();
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
    expect(screen.getByText("Solved in 1:24")).toBeTruthy();
  });

  it("an unsolved puzzle with an attempt record still offers Resume", () => {
    state.progress = { [key]: { filled: 0 } };
    tile();
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
  });
});
