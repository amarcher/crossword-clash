import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ preference: vi.fn(), writes: vi.fn() }));
vi.mock("./race", () => ({ fetchRaceVisibility: mocks.preference }));
vi.mock("./supabaseClient", () => ({ supabase: { from: () => {
  const api = { select: () => api, eq: () => api, maybeSingle: async () => ({ data: null, error: null }), upsert: mocks.writes };
  return api;
} } }));
const { prepareDailyResult, signDailyResult } = await import("./dailyLeaderboard");
const entry = { userId: "me", displayName: "Remembered name", mode: "solo" as const, seconds: 90 };
const account = { id: "me", is_anonymous: false };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("window", { location: { origin: "https://crosswordclash.com" } }); mocks.preference.mockResolvedValue("everyone"); mocks.writes.mockResolvedValue({ error: null }); });
afterEach(() => vi.unstubAllGlobals());
describe("solo leaderboard permission", () => {
  it("never posts a player with no account, whatever name they remembered", async () => {
    const result = await prepareDailyResult("2026-11-08", "mini", entry, { ...account, is_anonymous: true });
    expect(result).toMatchObject({ posted: false });
    expect(result.postingHold).toBeUndefined();
    expect(mocks.preference).not.toHaveBeenCalled();
    expect(mocks.writes).not.toHaveBeenCalled();
  });
  it("posts for an account whose solves only friends may watch, and carries a room's game", async () => {
    mocks.preference.mockResolvedValue("friends");
    const result = await prepareDailyResult("2026-11-08", "mini", { ...entry, mode: "race" }, account, "game-1");
    await result.settled;
    expect(result).toMatchObject({ posted: true, gameId: "game-1" });
    expect(mocks.writes).toHaveBeenCalledTimes(1);
  });
  it("automatically posts a named signed-in finish when everyone may watch", async () => {
    const result = await prepareDailyResult("2026-11-08", "mini", entry, account);
    await result.settled;
    expect(result.posted).toBe(true);
    expect(mocks.preference).toHaveBeenCalledWith("me");
    expect(mocks.writes).toHaveBeenCalledTimes(1);
  });
  it("holds the finish when the account hides its solves from everyone", async () => {
    mocks.preference.mockResolvedValue("hidden");
    const result = await prepareDailyResult("2026-11-08", "mini", entry, account);
    expect(result).toMatchObject({ posted: false, postingHold: "disabled" });
    expect(signDailyResult(result, "Another name")).toBe(result);
    expect(mocks.writes).not.toHaveBeenCalled();
  });
  it("keeps the finish private if the setting cannot be read", async () => {
    mocks.preference.mockRejectedValue(new Error("offline"));
    const result = await prepareDailyResult("2026-11-08", "mini", entry, account);
    expect(result).toMatchObject({ posted: false, postingHold: "unavailable" });
    expect(signDailyResult(result, "Another name")).toBe(result);
    expect(mocks.writes).not.toHaveBeenCalled();
  });
});
