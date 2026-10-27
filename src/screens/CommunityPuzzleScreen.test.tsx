// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import "../i18n/i18n";
import { resetHiddenAuthorsMemory } from "../lib/hiddenAuthors";
import type { CommunityPuzzleFull } from "../lib/communityPuzzles";
import type { TransferPuzzle } from "../lib/puzzleNormalizer";

const navigate = vi.fn();
vi.mock("../hooks/useTransitionNavigate", () => ({ useTransitionNavigate: () => navigate }));
const auth = { user: { id: "me" } as { id: string } | null, loading: false };
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("../lib/toastBus", () => ({ emitToast: vi.fn() }));
const game = { handleSoloPuzzleLoaded: vi.fn(async () => {}), setSoloTheme: vi.fn(), setUrlPuzzle: vi.fn() };
vi.mock("../contexts/GameContext", () => ({ useGame: () => game }));
let bestTimes: Record<string, number> = {};
vi.mock("../hooks/useSolveHistory", () => ({ useBestTimes: () => bestTimes }));
const community = vi.hoisted(() => ({ fetchCommunityPuzzle: vi.fn(), reportPuzzle: vi.fn() }));
vi.mock("../lib/communityPuzzles", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/communityPuzzles")>()), ...community }));

const { CommunityPuzzleScreen } = await import("./CommunityPuzzleScreen");
const { CommunityError } = await import("../lib/communityPuzzles");

const transfer: TransferPuzzle = {
  title: "Farm",
  author: "ada",
  size: { rows: 3, cols: 3 },
  grid: ["C", "A", "T", "O", "R", "E", "W", "E", "D"],
  gridnums: [1, 2, 3, 4, 0, 0, 5, 0, 0],
  clues: { across: ["1. Tabby", "4. Mined rock", "5. Tied the knot"], down: ["1. Dairy animal", "2. Exist", "3. Talk series"] },
  answers: { across: ["CAT", "ORE", "WED"], down: ["COW", "ARE", "TED"] },
};

const base: CommunityPuzzleFull = {
  id: "row-1", short_id: "abcdefgh", author_id: "ada-id", author: "ada", studio_id: "p-1", version: 1, status: "published", title: "Farm",
  notes: "A tiny one.", difficulty: "hard", lang: "en", width: 3, height: 3, clue_count: 6, puzzle_key: "key-1", puzzle: transfer, plays: 12, solves: 7,
  published_at: "2026-10-28T00:00:00Z", updated_at: "2026-10-28T00:00:00Z", removed_reason: null,
};

function renderAt(shortId = "abcdefgh") {
  return render(
    <MemoryRouter initialEntries={[`/puzzles/${shortId}`]}>
      <Routes>
        <Route path="/puzzles/:shortId" element={<CommunityPuzzleScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetHiddenAuthorsMemory();
  bestTimes = {};
  auth.user = { id: "me" };
  navigate.mockClear();
  game.handleSoloPuzzleLoaded.mockClear();
  community.fetchCommunityPuzzle.mockReset().mockResolvedValue(base);
  community.reportPuzzle.mockReset().mockResolvedValue({ held: false });
});
afterEach(cleanup);

describe("CommunityPuzzleScreen (/puzzles/:shortId)", () => {
  it("shows the puzzle's facts and plays it through the solo path", async () => {
    renderAt();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveProperty("textContent", "Farm");
    expect(community.fetchCommunityPuzzle).toHaveBeenCalledWith("abcdefgh");
    expect(screen.getByText("by @ada").closest("a")?.getAttribute("href")).toBe("/puzzles/by/ada");
    expect(screen.getByText("3×3 · 6 clues · Hard")).toBeTruthy();
    expect(screen.getByText("12 plays · 7 solved")).toBeTruthy();
    expect(screen.getByText("A tiny one.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play solo" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/solo/play"));
    expect((game.handleSoloPuzzleLoaded.mock.calls as unknown[][])[0][0]).toMatchObject({ origin: "community", author: "ada" });
  });

  it("shows the viewer's best time and offers Play again", async () => {
    bestTimes = { "key-1": 61 };
    renderAt();
    expect(await screen.findByText("You solved it in 1:01")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play again" })).toBeTruthy();
  });

  it("says when a puzzle isn't there", async () => {
    community.fetchCommunityPuzzle.mockResolvedValue(null);
    renderAt("nothing1");
    expect(await screen.findByText(/That puzzle isn't here/)).toBeTruthy();
  });

  it("reports from the overflow menu", async () => {
    renderAt();
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report this puzzle" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeTruthy();
    const send = screen.getByRole("button", { name: "Send report" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Copied from another publisher"));
    expect(screen.getByText("Copyright page").getAttribute("href")).toBe("/copyright");
    fireEvent.change(screen.getByLabelText(/Anything else/), { target: { value: "It's from a 2019 book." } });
    fireEvent.click(send);
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Thanks. We review reports within a day.");
    expect(community.reportPuzzle).toHaveBeenCalledWith("row-1", "copied", "It's from a 2019 book.");
  });

  it("explains a refused report", async () => {
    community.reportPuzzle.mockRejectedValue(new CommunityError("already_reported"));
    renderAt();
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report this puzzle" }));
    fireEvent.click(await screen.findByLabelText("Nonsense or broken"));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "You've already reported this puzzle.");
  });

  it("hides the author from the menu and can show them again", async () => {
    renderAt();
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide puzzles by @ada" }));
    expect(await screen.findByText("You hid this author's puzzles.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show again" }));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveProperty("textContent", "Farm");
  });

  it("gives the author Update in the studio instead of Report, and shows a held puzzle's note", async () => {
    auth.user = { id: "ada-id" };
    community.fetchCommunityPuzzle.mockResolvedValue({ ...base, status: "held" });
    renderAt();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText(/Your puzzle is being reviewed/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menuitem", { name: "Update in the studio" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Report this puzzle" })).toBeNull();
  });
});
