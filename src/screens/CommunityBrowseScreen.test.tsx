// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import "../i18n/i18n";
import { resetHiddenAuthorsMemory, hideAuthor } from "../lib/hiddenAuthors";
import type { CommunityPuzzle, CommunityPuzzleFull } from "../lib/communityPuzzles";
import type { TransferPuzzle } from "../lib/puzzleNormalizer";

const navigate = vi.fn();
vi.mock("../hooks/useTransitionNavigate", () => ({ useTransitionNavigate: () => navigate }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" }, loading: false }) }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));
const game = { handleSoloPuzzleLoaded: vi.fn(async () => {}), setSoloTheme: vi.fn(), setUrlPuzzle: vi.fn() };
vi.mock("../contexts/GameContext", () => ({ useGame: () => game }));
let bestTimes: Record<string, number> = {};
vi.mock("../hooks/useSolveHistory", () => ({ useBestTimes: () => bestTimes }));
const community = vi.hoisted(() => ({ fetchCommunityList: vi.fn(), fetchCommunityPuzzle: vi.fn() }));
vi.mock("../lib/communityPuzzles", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/communityPuzzles")>()), ...community }));

const { CommunityBrowseScreen } = await import("./CommunityBrowseScreen");

const transfer: TransferPuzzle = {
  title: "Farm",
  author: "ada",
  size: { rows: 3, cols: 3 },
  grid: ["C", "A", "T", "O", "R", "E", "W", "E", "D"],
  gridnums: [1, 2, 3, 4, 0, 0, 5, 0, 0],
  clues: { across: ["1. Tabby", "4. Mined rock", "5. Tied the knot"], down: ["1. Dairy animal", "2. Exist", "3. Talk series"] },
  answers: { across: ["CAT", "ORE", "WED"], down: ["COW", "ARE", "TED"] },
};

function row(n: number, overrides: Partial<CommunityPuzzle> = {}): CommunityPuzzle {
  return {
    id: `id-${n}`, short_id: `short${n}`.padEnd(8, "x"), author_id: "ada-id", author: "ada", studio_id: `p-${n}`, version: 1, status: "published",
    title: `Puzzle ${n}`, notes: "", difficulty: "medium", lang: "en", width: 5, height: 5, clue_count: 10, puzzle_key: `key-${n}`,
    plays: n, solves: 0, published_at: "2026-10-28T00:00:00Z", updated_at: "2026-10-28T00:00:00Z", removed_reason: null, ...overrides,
  };
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/puzzles" element={<CommunityBrowseScreen />} />
        <Route path="/puzzles/by/:username" element={<CommunityBrowseScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetHiddenAuthorsMemory();
  bestTimes = {};
  navigate.mockClear();
  game.handleSoloPuzzleLoaded.mockClear();
  game.setUrlPuzzle.mockClear();
  community.fetchCommunityList.mockReset().mockResolvedValue([row(1), row(2, { author: "bob", author_id: "bob-id" })]);
  community.fetchCommunityPuzzle.mockReset().mockImplementation(async (shortId: string) => ({ ...row(1), short_id: shortId, puzzle: transfer }) as CommunityPuzzleFull);
});
afterEach(cleanup);

describe("CommunityBrowseScreen (/puzzles)", () => {
  it("lists the published puzzles with their facts and links", async () => {
    renderAt("/puzzles");
    expect(await screen.findByText("Puzzle 1")).toBeTruthy();
    expect(community.fetchCommunityList).toHaveBeenCalledWith(expect.objectContaining({ size: "all", sort: "newest", lang: "en", query: "", author: null }), 0);
    expect(screen.getByText("by @bob").closest("a")?.getAttribute("href")).toBe("/puzzles/by/bob");
    expect(screen.getByText("Puzzle 2").closest("a")?.getAttribute("href")).toBe("/puzzles/short2xx");
    expect(screen.getAllByText("5×5 · 10 clues · Medium")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("puts a filter in the URL and refetches with it", async () => {
    renderAt("/puzzles");
    await screen.findByText("Puzzle 1");
    fireEvent.click(screen.getByRole("button", { name: "Full" }));
    await waitFor(() => expect(community.fetchCommunityList).toHaveBeenLastCalledWith(expect.objectContaining({ size: "full" }), 0));
    expect(screen.getByRole("button", { name: "Full" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("drops a hidden author's puzzles and says so", async () => {
    hideAuthor("bob-id");
    renderAt("/puzzles");
    await screen.findByText("Puzzle 1");
    expect(screen.queryByText("Puzzle 2")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("1 puzzle by an author you hid isn't shown.");
  });

  it("plays through the solo path with the live username and the community tag", async () => {
    renderAt("/puzzles");
    await screen.findByText("Puzzle 1");
    fireEvent.click(screen.getAllByRole("button", { name: "Play solo" })[0]);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/solo/play"));
    expect(community.fetchCommunityPuzzle).toHaveBeenCalledWith("short1xx");
    const puzzle = game.handleSoloPuzzleLoaded.mock.calls[0][0] as { origin?: string; author: string; title: string };
    expect(puzzle.origin).toBe("community");
    expect(puzzle.author).toBe("ada");
    expect(game.setSoloTheme).toHaveBeenCalledWith(null);
  });

  it("races through the host flow", async () => {
    renderAt("/puzzles");
    await screen.findByText("Puzzle 1");
    fireEvent.click(screen.getAllByRole("button", { name: "Race friends" })[1]);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/host-game/name"));
    expect(game.setUrlPuzzle).toHaveBeenCalledWith(expect.objectContaining({ origin: "community" }));
  });

  it("offers Load more after a full page and appends the next", async () => {
    community.fetchCommunityList.mockResolvedValueOnce(Array.from({ length: 24 }, (_, i) => row(i + 1))).mockResolvedValueOnce([row(25)]);
    renderAt("/puzzles");
    const more = await screen.findByRole("button", { name: "Load more" });
    fireEvent.click(more);
    expect(await screen.findByText("Puzzle 25")).toBeTruthy();
    expect(community.fetchCommunityList).toHaveBeenLastCalledWith(expect.anything(), 1);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("shows the solved chip and can hide solved puzzles", async () => {
    bestTimes = { "key-1": 83 };
    renderAt("/puzzles");
    await screen.findByText("Puzzle 1");
    expect(screen.getByText("1:23")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide solved" }));
    expect(screen.queryByText("Puzzle 1")).toBeNull();
    expect(screen.getByText("Puzzle 2")).toBeTruthy();
  });

  it("renders an author's page from the route, every language, with Hide this author", async () => {
    community.fetchCommunityList.mockResolvedValue([row(1)]);
    renderAt("/puzzles/by/ada");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveProperty("textContent", "@ada");
    expect(community.fetchCommunityList).toHaveBeenCalledWith(expect.objectContaining({ author: "ada", lang: "all" }), 0);
    expect(screen.getByText("1 puzzle")).toBeTruthy();
    expect(screen.queryByText("by @ada")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hide puzzles by @ada" }));
    expect(screen.getByText("You hid this author's puzzles on this device.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show again" }));
    expect(await screen.findByText("Puzzle 1")).toBeTruthy();
  });

  it("explains an empty library and a failed load", async () => {
    community.fetchCommunityList.mockResolvedValueOnce([]);
    const { unmount } = renderAt("/puzzles");
    expect(await screen.findByText(/Nothing published yet/)).toBeTruthy();
    unmount();
    community.fetchCommunityList.mockRejectedValueOnce(new Error("down"));
    renderAt("/puzzles");
    expect(await screen.findByText("Puzzles couldn't be loaded right now.")).toBeTruthy();
  });
});
