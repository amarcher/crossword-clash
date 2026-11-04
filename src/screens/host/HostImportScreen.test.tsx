// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../../i18n/i18n";
import type { DailyMini } from "../../lib/dailyMinis";
import type { Puzzle } from "../../types/puzzle";

/**
 * The TV's puzzle chooser (Andrew, 2026-11-03: it still read like the days
 * before the dailies, the archive and the community): today's dailies as
 * tiles that load straight into the TV, the archive and the community with
 * `?intent=tv`, then the file and import sources; no samples anywhere.
 */
const host = vi.hoisted(() => ({ handlePuzzleLoaded: vi.fn() }));
vi.mock("../../layouts/HostLayout", () => ({ useHostContext: () => host }));
const feed = vi.hoisted(() => ({ dailies: {} as Record<string, DailyMini | null | undefined> }));
vi.mock("../../hooks/useNextUp", () => ({ useTodaysDailies: () => feed.dailies }));
vi.mock("../../lib/community", () => ({ communityEnabled: () => true }));
vi.mock("../../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("../../components/AdSlot", () => ({ AdSlot: () => null }));
vi.mock("../../components/NytRecommendation", () => ({ NytRecommendation: () => null }));

const { HostImportScreen } = await import("./HostImportScreen");

function grid(title: string, size: number): Puzzle {
  const cells = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => ({ row: r, col: c, solution: "A" })));
  return { title, author: "", width: size, height: size, cells, clues: [{ direction: "across", number: 1, text: "Clue", row: 0, col: 0, length: size, answer: "A".repeat(size) }] };
}
const mini: DailyMini = { theme: "Ocean", puzzle: grid("Tide Pool", 5) };
const midi: DailyMini = { theme: "", puzzle: grid("Night Owl", 9) };
const large: DailyMini = { theme: "Civics", puzzle: grid("Ballot Measures", 15) };

const renderChooser = () =>
  render(
    <MemoryRouter initialEntries={["/host/import"]}>
      <HostImportScreen />
    </MemoryRouter>,
  );

beforeEach(() => {
  host.handlePuzzleLoaded.mockClear();
  feed.dailies = { mini, midi, large };
});
afterEach(cleanup);

describe("HostImportScreen (the TV's puzzle chooser)", () => {
  it("offers today's dailies as tiles that load straight into the TV, with the slot, size and theme", () => {
    renderChooser();
    expect(screen.getByRole("heading", { name: "Choose a puzzle for the TV" })).toBeTruthy();
    const tiles = screen.getAllByRole("button", { name: /on TV$/ });
    expect(tiles.map((b) => b.getAttribute("aria-label"))).toEqual(["Host Tide Pool on TV", "Host Night Owl on TV", "Host Ballot Measures on TV"]);
    expect(tiles[0].textContent).toContain("Daily Mini");
    expect(tiles[0].textContent).toContain("Ocean");
    expect(tiles[2].textContent).toContain("15×15");
    fireEvent.click(tiles[2]);
    expect(host.handlePuzzleLoaded).toHaveBeenCalledWith(large.puzzle);
  });

  it("links the archive and the community with the TV intent, keeps the file and import sources, and offers no samples", () => {
    renderChooser();
    expect(screen.getByRole("link", { name: /Past puzzles/ }).getAttribute("href")).toBe("/archive?intent=tv");
    expect(screen.getByRole("link", { name: /Community puzzles/ }).getAttribute("href")).toBe("/puzzles?intent=tv");
    expect(screen.getByText("Drop a file")).toBeTruthy();
    // A way out: the site bar's back control (the bar draws none without a label).
    expect(screen.getByRole("link", { name: "Back to menu" }).getAttribute("href")).toBe("/menu");
    expect(screen.queryByText("Try a sample")).toBeNull();
    expect(screen.queryByText("Ice Cold")).toBeNull();
  });

  it("shows a placeholder while the feed answers and no tile for a slot with nothing published", () => {
    feed.dailies = { mini: undefined, midi: null, large: undefined };
    const { container } = renderChooser();
    expect(screen.queryAllByRole("button", { name: /on TV$/ })).toHaveLength(0);
    expect(container.querySelectorAll("[aria-hidden='true'].animate-pulse")).toHaveLength(2);
  });
});
