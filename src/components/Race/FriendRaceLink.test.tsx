// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n/i18n";
import { FriendRaceLink } from "./FriendRaceLink";
import { buildPuzzle } from "../../lib/samplePuzzles";

const mocks = vi.hoisted(() => ({
  candidates: [] as { userId: string; username: string; seconds: number | null; friend: boolean }[],
  user: { id: "me" } as { id: string } | null,
}));
vi.mock("../../hooks/useRace", () => ({ useRaceCandidates: () => mocks.candidates }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("../../lib/race", async (orig) => ({
  ...(await orig<typeof import("../../lib/race")>()),
  fetchOwnSolveTrace: async () => ({ seconds: 20, events: [[2_000, 0, "A"], [8_000, 1, "B"], [14_000, 2, "C"], [20_000, 3, "D"]] }),
  loadTrace: () => null,
}));
vi.mock("../../lib/friendRace", async (orig) => ({
  ...(await orig<typeof import("../../lib/friendRace")>()),
  fetchFriendRace: async () => ({ friends: [{ userId: "ann", username: "ann", seconds: 12, events: [[1_000, 3, "D"], [4_000, 2, "C"], [9_000, 1, "B"], [12_000, 0, "A"]] }], withLetters: true }),
}));

const puzzle = buildPuzzle({ title: "Tiny", grid: ["ab", "cd"], clueTexts: {} });
afterEach(cleanup);

describe("FriendRaceLink", () => {
  it("is absent until a friend has a recording, and for a signed-out viewer", () => {
    mocks.candidates = [{ userId: "x", username: "stranger", seconds: null, friend: false }];
    const { container } = render(<FriendRaceLink puzzle={puzzle} puzzleKey="k" placement="test" />);
    expect(container.textContent).toBe("");
    cleanup();
    mocks.candidates = [{ userId: "ann", username: "ann", seconds: null, friend: true }];
    mocks.user = null;
    expect(render(<FriendRaceLink puzzle={puzzle} puzzleKey="k" placement="test" />).container.textContent).toBe("");
    mocks.user = { id: "me" };
  });

  it("names a lone friend and opens the race with the viewer's own solve in it", async () => {
    mocks.candidates = [{ userId: "ann", username: "ann", seconds: null, friend: true }];
    render(<FriendRaceLink puzzle={puzzle} puzzleKey="k" placement="test" />);
    fireEvent.click(screen.getByRole("button", { name: "Your race with ann" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "The race" })).toBeTruthy());
    expect(screen.getAllByTestId("race-lane")).toHaveLength(2);
  });
});
