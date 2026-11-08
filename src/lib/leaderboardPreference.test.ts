import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn() }));
vi.mock("./supabaseClient", () => ({ supabase: { auth } }));
const { fetchSoloLeaderboardPreference, saveSoloLeaderboardPreference } = await import("./leaderboardPreference");
beforeEach(() => {
  vi.clearAllMocks();
  auth.getUser.mockResolvedValue({ data: { user: { id: "me", is_anonymous: false, user_metadata: {} } }, error: null });
  auth.updateUser.mockResolvedValue({ error: null });
});
describe("account leaderboard preference", () => {
  it("defaults on and reads an opt-out saved on another device", async () => {
    expect(await fetchSoloLeaderboardPreference("me")).toBe(true);
    auth.getUser.mockResolvedValue({ data: { user: { id: "me", is_anonymous: false, user_metadata: { solo_leaderboard_enabled: false } } }, error: null });
    expect(await fetchSoloLeaderboardPreference("me")).toBe(false);
    expect(auth.getUser).toHaveBeenCalledTimes(2);
  });
  it("updates only this preference in the signed-in account metadata", async () => {
    await saveSoloLeaderboardPreference("me", false);
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { solo_leaderboard_enabled: false } });
  });
  it("refuses an anonymous or switched account, and surfaces a failed save", async () => {
    auth.getUser.mockResolvedValueOnce({ data: { user: { id: "me", is_anonymous: true } }, error: null });
    await expect(saveSoloLeaderboardPreference("me", false)).rejects.toThrow("Account changed");
    await expect(saveSoloLeaderboardPreference("other", false)).rejects.toThrow("Account changed");
    expect(auth.updateUser).not.toHaveBeenCalled();
    auth.updateUser.mockResolvedValue({ error: new Error("offline") });
    await expect(saveSoloLeaderboardPreference("me", false)).rejects.toThrow("offline");
  });
});
