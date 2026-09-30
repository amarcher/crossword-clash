import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), fetch: vi.fn() }));
vi.mock("./supabaseClient", () => ({ supabase: { from: mocks.from } }));
vi.mock("./puzzleService", () => ({ fetchGameState: mocks.fetch }));
import { fetchSpectatorRoom } from "./spectatorService";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockResolvedValue({ cells: {}, players: [], status: "waiting", settings: null, startedAt: null, completedAt: null });
  mocks.from.mockImplementation((table: string) => {
    // Only SELECT is exposed: any attempted player/host mutation fails the test.
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: table === "games" ? { id: "game-1", puzzle_id: "puzzle-1" } :
        { title: "Synthetic", author: "Test", width: 2, height: 2, grid: [], clues: [] }, error: null }) };
    return query;
  });
});
describe("TV room lookup", () => {
  it("loads a room without joining as a player and reuses its puzzle for live refreshes", async () => {
    const room = await fetchSpectatorRoom("ABC123");
    expect(room?.gameId).toBe("game-1");
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["games", "puzzles"]);
    mocks.from.mockClear();
    mocks.fetch.mockResolvedValue({ ...room!.state, status: "active", cells: { "0,0": { letter: "A", correct: true, playerId: "player-1" } } });
    const live = await fetchSpectatorRoom("ABC123", room);
    expect(live?.puzzle).toBe(room?.puzzle);
    expect(live?.state.status).toBe("active");
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["games"]);
  });
  it("rejects malformed codes before querying and handles unknown rooms", async () => {
    expect(await fetchSpectatorRoom("bad")).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: {} }) }) }) });
    expect(await fetchSpectatorRoom("ABC123")).toBeNull();
  });
  it("loads the next puzzle when a rematch moves the room code, and returns closed state", async () => {
    const previous = await fetchSpectatorRoom("ABC123");
    mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => ({ single: async () => ({ error: null,
      data: table === "games" ? { id: "game-2", puzzle_id: "puzzle-2" } : { title: "Rematch", author: "Test", width: 2, height: 2, grid: [], clues: [] } }) }) }) }));
    mocks.fetch.mockResolvedValue({ ...previous!.state, status: "closed" });
    const next = await fetchSpectatorRoom("ABC123", previous);
    expect(next?.gameId).toBe("game-2");
    expect(next?.puzzle.title).toBe("Rematch");
    expect(next?.state.status).toBe("closed");
  });
});
