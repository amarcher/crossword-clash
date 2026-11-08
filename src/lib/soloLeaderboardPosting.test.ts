import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ preference: vi.fn(), writes: vi.fn() }));
vi.mock("./leaderboardPreference", () => ({ fetchSoloLeaderboardPreference: mocks.preference }));
vi.mock("./supabaseClient", () => ({ supabase: { from: () => {
  const api = { select: () => api, eq: () => api, maybeSingle: async () => ({ data: null, error: null }), upsert: mocks.writes };
  return api;
} } }));
const { prepareSoloDailyResult, signDailyResult } = await import("./dailyLeaderboard");
const entry = { userId: "me", displayName: "Remembered name", mode: "solo" as const, seconds: 90 };
const account = { id: "me", is_anonymous: false };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("window", { location: { origin: "https://crosswordclash.com" } }); mocks.preference.mockResolvedValue(true); mocks.writes.mockResolvedValue({ error: null }); });
afterEach(() => vi.unstubAllGlobals());
describe("solo leaderboard permission", () => {
  it("keeps a guest with a remembered name private until explicitly signed after finishing", async () => {
    const result = await prepareSoloDailyResult("2026-11-08", "mini", entry, { ...account, is_anonymous: true });
    expect(result.posted).toBe(false);
    expect(mocks.preference).not.toHaveBeenCalled();
    expect(mocks.writes).not.toHaveBeenCalled();
    const signed = signDailyResult(result, "Guest chose this name");
    await signed.settled;
    expect(mocks.writes).toHaveBeenCalledWith(expect.objectContaining({ display_name: "Guest chose this name" }), expect.anything());
  });
  it("automatically posts a named signed-in finish when enabled", async () => {
    const result = await prepareSoloDailyResult("2026-11-08", "mini", entry, account);
    await result.settled;
    expect(result.posted).toBe(true);
    expect(mocks.preference).toHaveBeenCalledWith("me");
    expect(mocks.writes).toHaveBeenCalledTimes(1);
  });
  it("blocks posting and signing when the account setting is off", async () => {
    mocks.preference.mockResolvedValue(false);
    const result = await prepareSoloDailyResult("2026-11-08", "mini", entry, account);
    expect(result).toMatchObject({ posted: false, postingHold: "disabled" });
    expect(signDailyResult(result, "Another name")).toBe(result);
    expect(mocks.writes).not.toHaveBeenCalled();
  });
  it("keeps the finish private if the preference cannot be read", async () => {
    mocks.preference.mockRejectedValue(new Error("offline"));
    const result = await prepareSoloDailyResult("2026-11-08", "mini", entry, account);
    expect(result).toMatchObject({ posted: false, postingHold: "unavailable" });
    expect(signDailyResult(result, "Another name")).toBe(result);
    expect(mocks.writes).not.toHaveBeenCalled();
  });
});
