// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import "../i18n/i18n";
import type { Puzzle } from "../types/puzzle";
import type { ChallengePayload } from "../lib/challenge";

const share = vi.hoisted(() => ({ fetchReplayShare: vi.fn(), ghostFromReplay: vi.fn() }));
vi.mock("../lib/replayShare", () => share);
const race = vi.hoisted(() => ({ saveRace: vi.fn() }));
vi.mock("../lib/race", async (orig) => ({ ...(await orig<typeof import("../lib/race")>()), saveRace: race.saveRace }));
const game = vi.hoisted(() => ({ urlPuzzle: null as Puzzle | null, urlChallenge: null as ChallengePayload | null, handleSoloPuzzleLoaded: vi.fn(async () => true) }));
vi.mock("../contexts/GameContext", () => ({ useGame: () => game }));
vi.mock("../components/AdSlot", () => ({ AdSlot: () => null }));

const { ChallengeScreen } = await import("./ChallengeScreen");

const puzzle = {
  title: "Daily Large",
  author: "",
  width: 2,
  height: 1,
  cells: [[{ row: 0, col: 0, solution: "A", number: 1 }, { row: 0, col: 1, solution: "B", number: null }]],
  clues: [],
} as unknown as Puzzle;
const ghost = { userId: "link:E0Gqr8Iw09i", name: "Andrew", color: "#8b5cf6", seconds: 612, events: [[0, 0, 1]] };

function renderScreen() {
  render(
    <MemoryRouter initialEntries={["/challenge"]}>
      <Routes>
        <Route path="/challenge" element={<ChallengeScreen />} />
        <Route path="/solo/play" element={<p>playing</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  game.urlPuzzle = puzzle;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChallengeScreen", () => {
  it("offers to race the sender's solve by default when the link carries their replay, saying they'll see the result", async () => {
    game.urlChallenge = { name: "Andrew", seconds: 612, replay: "E0Gqr8Iw09i", ref: { day: "2026-11-12", slot: "large" } };
    share.fetchReplayShare.mockResolvedValueOnce("CODE");
    share.ghostFromReplay.mockReturnValueOnce({ ...ghost, link: { shareId: "E0Gqr8Iw09i", ref: { day: "2026-11-12", slot: "large" } } });
    renderScreen();
    const race = await screen.findByRole("button", { name: "Race Andrew's solve" });
    expect(share.ghostFromReplay).toHaveBeenCalledWith("CODE", "E0Gqr8Iw09i", "Andrew", { day: "2026-11-12", slot: "large" });
    expect(screen.getByText(/When you finish, Andrew sees your time and solve/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Just solve it" })).toBeTruthy();
    fireEvent.click(race);
    await screen.findByText("playing");
    expect(raceSaved()).toEqual({ ghosts: [{ ...ghost, link: { shareId: "E0Gqr8Iw09i", ref: { day: "2026-11-12", slot: "large" } } }] });
  });

  it("falls back to the time-only challenge when the replay can't load", async () => {
    game.urlChallenge = { name: "Andrew", seconds: 612, replay: "E0Gqr8Iw09i" };
    share.fetchReplayShare.mockResolvedValueOnce(null);
    renderScreen();
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept Challenge" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Race Andrew/ })).toBeNull();
  });

  it("is the plain time challenge for a link without a replay", () => {
    game.urlChallenge = { name: "Andrew", seconds: 612 };
    renderScreen();
    expect(screen.getByRole("button", { name: "Accept Challenge" })).toBeTruthy();
    expect(share.fetchReplayShare).not.toHaveBeenCalled();
  });
});

function raceSaved() {
  const call = race.saveRace.mock.calls.find((c) => c[0]);
  return call ? { ghosts: call[0].ghosts } : null;
}
