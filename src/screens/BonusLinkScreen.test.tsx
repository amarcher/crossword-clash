// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import "../i18n/i18n";

const DAY = "2026-11-18";
const card = { day: DAY, title: "Tempting Fate", theme: "Superstitions", author: "Crossword Clash", width: 5, height: 5, blocks: ".".repeat(25), identity: "bonus-key" };
const bonus = vi.hoisted(() => ({ fetchBonusCard: vi.fn(), loadBonusPuzzle: vi.fn() }));
vi.mock("../lib/bonus", async (orig) => ({ ...(await orig<typeof import("../lib/bonus")>()), ...bonus }));
vi.mock("../lib/dailyLeaderboard", async (orig) => ({ ...(await orig<typeof import("../lib/dailyLeaderboard")>()), todayKey: () => "2026-11-18" }));
const account = vi.hoisted(() => ({ value: { available: true, plus: false, plusReady: true, openPaywall: vi.fn() } as { available: boolean; plus: boolean; plusReady: boolean; openPaywall: (o: unknown) => void } | null }));
vi.mock("../contexts/AccountContext", () => ({ useMaybeAccount: () => account.value }));
const game = vi.hoisted(() => ({ setUrlPuzzle: vi.fn(), setUrlChallenge: vi.fn(), handleSoloPuzzleLoaded: vi.fn(async () => true) }));
vi.mock("../contexts/GameContext", () => ({ useGame: () => game }));
vi.mock("../components/Flow", () => ({
  FlowPage: ({ title, subtitle, children }: { title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </div>
  ),
}));
vi.mock("../components/ui/PlusBadge", () => ({ PlusBadge: () => null }));
// The shared race is its own component (SharedRace.test): here, what it is given.
const shared = vi.hoisted(() => ({ props: null as null | { puzzle: { title: string; cells: { solution: string | null }[][]; clues: unknown[] }; puzzleKey: string; shareId: string; names: string[]; shareRef: unknown; locked: boolean; onSolve: () => void } }));
vi.mock("../components/Race/SharedRace", () => ({
  SharedRace: (props: NonNullable<typeof shared.props>) => {
    shared.props = props;
    return <button onClick={props.onSolve}>shared race: solve</button>;
  },
}));
const share = vi.hoisted(() => ({ fetchReplayShare: vi.fn() }));
vi.mock("../lib/replayShare", async (orig) => ({ ...(await orig<typeof import("../lib/replayShare")>()), ...share }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));
const sheet = vi.hoisted(() => ({ shareText: vi.fn(async () => ({ outcome: "copied", method: "clipboard" })) }));
vi.mock("../lib/shareSheet", () => sheet);
vi.mock("../components/CompletionModal/ShareResultButton", () => ({ runtimeDeps: async () => ({}) }));

const { encodeReplay } = await import("../lib/replayCode");
// The sender's solve of the card's 5×5 grid, as the link's code holds it: squares and times, and the letters only as right or wrong.
const solved = (size: number) => ({ width: size, height: size, cells: Array.from({ length: size }, () => Array.from({ length: size }, () => ({ solution: "Q" }))) });
const CODE = encodeReplay(solved(5), [[1000, 0, "Q"], [2000, 6, "Z"], [3000, 24, "Q"]], 102)!;

const { BonusLinkScreen } = await import("./BonusLinkScreen");

function Where({ id }: { id: string }) {
  const location = useLocation();
  return <div data-testid={id}>{location.pathname + location.search}</div>;
}
const show = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/bonus/leaderboard" element={<Where id="board" />} />
        <Route path="/bonus/:day" element={<BonusLinkScreen />} />
        <Route path="/challenge" element={<Where id="challenge" />} />
        <Route path="/solo/play" element={<Where id="playing" />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  bonus.fetchBonusCard.mockReset().mockResolvedValue(card);
  bonus.loadBonusPuzzle.mockReset().mockResolvedValue({ title: "Tempting Fate", origin: "bonus", bonusDay: DAY });
  share.fetchReplayShare.mockReset().mockResolvedValue(CODE);
  sheet.shareText.mockClear();
  account.value = { available: true, plus: false, plusReady: true, openPaywall: vi.fn() };
  game.setUrlPuzzle.mockClear();
  game.setUrlChallenge.mockClear();
  game.handleSoloPuzzleLoaded.mockClear();
  shared.props = null;
});
afterEach(cleanup);

describe("BonusLinkScreen (/bonus/:day)", () => {
  it("opens on the sender's squares for a visitor without Plus, 'Let me solve it' opening the paywall, and never loads the puzzle", async () => {
    show(`/bonus/${DAY}?beat=102&by=Archer&r=E0Gqr8Iw09i`);
    const dialog = await screen.findByRole("dialog", { name: "Archer's solve" });
    expect(share.fetchReplayShare).toHaveBeenCalledWith("E0Gqr8Iw09i");
    expect(screen.getByTestId("race-puzzle").textContent).toBe("Daily Plus · Nov 18 · Tempting Fate");
    expect(dialog.textContent).toContain("Replayed, letters hidden");
    // The card's shape and nothing of the answer: 25 squares, none with a letter.
    expect(dialog.querySelectorAll("span.aspect-square")).toHaveLength(25);
    expect([...dialog.querySelectorAll("span.aspect-square")].map((c) => c.textContent).join("")).toBe("");
    expect(screen.queryAllByRole("gridcell")).toHaveLength(0);
    expect(screen.queryByTestId("race-share")).toBeNull();
    fireEvent.click(screen.getByTestId("race-cta"));
    expect(screen.getByTestId("race-cta").textContent).toBe("Let me solve it");
    const gate = { placement: "bonus-link", feature: "bonus", returnTo: `/bonus/${DAY}?beat=102&by=Archer&r=E0Gqr8Iw09i` };
    expect(account.value!.openPaywall).toHaveBeenCalledWith(gate);
    // Passing the link on sends the same link.
    fireEvent.click(screen.getByTestId("race-forward"));
    await waitFor(() => expect(sheet.shareText).toHaveBeenCalled());
    expect((sheet.shareText.mock.calls[0] as unknown as [{ text: string }])[0].text).toMatch(/\/bonus\/2026-11-18\?beat=102&by=Archer&r=E0Gqr8Iw09i$/);
    // Closed, the page says the same two things and keeps the one gated action.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Archer solved the Daily Plus" })).toBeTruthy();
    expect(screen.getByText("Nov 18 · Tempting Fate · Superstitions")).toBeTruthy();
    expect(screen.getByText("Archer solved it in 1:42")).toBeTruthy();
    expect(screen.getByText("Daily Plus puzzles come with Crossword Clash Plus.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Let me solve it" }));
    expect(account.value!.openPaywall).toHaveBeenCalledTimes(2);
    expect(bonus.fetchBonusCard).toHaveBeenCalledWith(DAY);
    expect(bonus.loadBonusPuzzle).not.toHaveBeenCalled();
    expect(game.setUrlPuzzle).not.toHaveBeenCalled();
  });

  it("is the page alone when the link has no valid replay, the replay can't be read or isn't of this grid, or there is no account provider", async () => {
    account.value = null;
    show(`/bonus/${DAY}?beat=102&by=Archer&r=nope`);
    expect(await screen.findByRole("heading", { name: "Archer solved the Daily Plus" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Let me solve it" })).toBeTruthy();
    expect(share.fetchReplayShare).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bonus.loadBonusPuzzle).not.toHaveBeenCalled();
    cleanup();
    for (const code of [null, encodeReplay(solved(7), [[1000, 40, "Q"]], 60)!]) {
      share.fetchReplayShare.mockResolvedValue(code);
      show(`/bonus/${DAY}?beat=102&by=Archer&r=E0Gqr8Iw09i`);
      expect(await screen.findByRole("heading", { name: "Archer solved the Daily Plus" })).toBeTruthy();
      await waitFor(() => expect(share.fetchReplayShare).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByRole("dialog")).toBeNull();
      share.fetchReplayShare.mockClear();
      cleanup();
    }
  });

  it("opens a shared race for a visitor without Plus on the card's shape, squares only, 'Let me solve it' opening the paywall", async () => {
    show(`/bonus/${DAY}?r=E0Gqr8Iw09i&race=2&who=minna,archer`);
    await screen.findByRole("heading", { name: "Play the Daily Plus" });
    expect(shared.props).toMatchObject({ puzzleKey: "bonus-key", shareId: "E0Gqr8Iw09i", names: ["minna", "archer"], shareRef: { bonusDay: DAY }, locked: true });
    // The grid it is given holds no answers and no clues.
    expect(shared.props!.puzzle.cells.flat().every((c) => c.solution === "")).toBe(true);
    expect(shared.props!.puzzle.clues).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "shared race: solve" }));
    expect(account.value!.openPaywall).toHaveBeenCalledWith({ placement: "bonus-link", feature: "bonus", returnTo: `/bonus/${DAY}?r=E0Gqr8Iw09i&race=2&who=minna,archer` });
    expect(bonus.loadBonusPuzzle).not.toHaveBeenCalled();
    expect(share.fetchReplayShare).not.toHaveBeenCalled();
  });

  it("opens a shared race for Plus on the puzzle itself, 'Let me solve it' starting it", async () => {
    account.value = { available: true, plus: true, plusReady: true, openPaywall: vi.fn() };
    const puzzle = { title: "Tempting Fate", author: "", width: 1, height: 1, cells: [[{ row: 0, col: 0, solution: "A" }]], clues: [], origin: "bonus", bonusDay: DAY };
    bonus.loadBonusPuzzle.mockResolvedValue(puzzle);
    show(`/bonus/${DAY}?r=E0Gqr8Iw09i&race=2`);
    await screen.findByRole("heading", { name: "Play the Daily Plus" });
    expect(shared.props).toMatchObject({ shareId: "E0Gqr8Iw09i", shareRef: { bonusDay: DAY }, locked: false });
    expect(shared.props!.puzzle).toBe(puzzle);
    fireEvent.click(screen.getByRole("button", { name: "Let me solve it" }));
    await waitFor(() => expect(screen.getByTestId("playing")).toBeTruthy());
    expect(game.handleSoloPuzzleLoaded).toHaveBeenCalledWith(puzzle);
    expect(account.value.openPaywall).not.toHaveBeenCalled();
    expect(bonus.fetchBonusCard).not.toHaveBeenCalled();
  });

  it("waits for the entitlement before deciding, fetching nothing", () => {
    account.value = { available: true, plus: false, plusReady: false, openPaywall: vi.fn() };
    show(`/bonus/${DAY}?beat=102&by=Archer`);
    expect(screen.getByRole("status").textContent).toContain("Daily Plus");
    expect(bonus.fetchBonusCard).not.toHaveBeenCalled();
    expect(bonus.loadBonusPuzzle).not.toHaveBeenCalled();
  });

  it("hands Plus the puzzle and the sender's challenge, solved before or not (the challenge screen decides)", async () => {
    account.value = { available: true, plus: true, plusReady: true, openPaywall: vi.fn() };
    show(`/bonus/${DAY}?beat=102&by=Archer&r=E0Gqr8Iw09i`);
    await waitFor(() => expect(screen.getByTestId("challenge")).toBeTruthy());
    expect(bonus.loadBonusPuzzle).toHaveBeenCalledWith(DAY);
    expect(game.setUrlPuzzle).toHaveBeenCalledWith({ title: "Tempting Fate", origin: "bonus", bonusDay: DAY });
    expect(game.setUrlChallenge).toHaveBeenCalledWith({ name: "Archer", seconds: 102, replay: "E0Gqr8Iw09i", ref: { bonusDay: DAY } });
    expect(bonus.fetchBonusCard).not.toHaveBeenCalled();
  });

  it("sends Plus to the day's board when the link carries no time", async () => {
    account.value = { available: true, plus: true, plusReady: true, openPaywall: vi.fn() };
    show(`/bonus/${DAY}`);
    await waitFor(() => expect(screen.getByTestId("board").textContent).toBe("/bonus/leaderboard"));
    expect(game.setUrlChallenge).not.toHaveBeenCalled();
  });

  it("says so for a day with no Daily Plus, a puzzle Plus can't load, and a day to come", async () => {
    bonus.fetchBonusCard.mockResolvedValue(null);
    show("/bonus/2026-11-01?beat=102");
    expect((await screen.findByRole("heading")).textContent).toBe("No Daily Plus for Nov 1");
    cleanup();
    account.value = { available: true, plus: true, plusReady: true, openPaywall: vi.fn() };
    bonus.loadBonusPuzzle.mockResolvedValue(null);
    show(`/bonus/${DAY}?beat=102`);
    expect((await screen.findByRole("heading")).textContent).toBe("No Daily Plus for Nov 18");
    expect(game.setUrlPuzzle).not.toHaveBeenCalled();
    cleanup();
    bonus.loadBonusPuzzle.mockClear();
    show("/bonus/2026-11-19?beat=102");
    expect(screen.getByRole("heading").textContent).toBe("No Daily Plus for Nov 19");
    expect(bonus.loadBonusPuzzle).not.toHaveBeenCalled();
  });

  it("is a not-found page for anything that isn't a day", () => {
    show("/bonus/tomorrow");
    expect(screen.getByText("Page not found")).toBeTruthy();
    expect(bonus.fetchBonusCard).not.toHaveBeenCalled();
  });
});
