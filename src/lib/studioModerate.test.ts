import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchModerationQueue, moderatePuzzle, reasonSummary, suggestsBan, topReason } from "./studioModerate";

vi.mock("./studioAuth", () => ({ studioHeaders: async (token: string) => ({ "Content-Type": "application/json", "x-studio-token": token }) }));

describe("reasonSummary / topReason / suggestsBan", () => {
  const reports = [{ reason: "nonsense" }, { reason: "copied" }, { reason: "copied" }, { reason: "other" }] as const;

  it("counts reasons, most frequent first, ties alphabetical", () => {
    expect(reasonSummary(reports)).toBe("copied ×2 · nonsense ×1 · other ×1");
    expect(reasonSummary([])).toBe("");
  });

  it("defaults the removal reason to the most-given one", () => {
    expect(topReason(reports)).toBe("copied");
    expect(topReason([])).toBe("other");
  });

  it("suggests stopping an author on their third removal, never one already stopped", () => {
    expect(suggestsBan({ publisher: { user_id: "a", strikes: 2, banned_at: null } })).toBe(true);
    expect(suggestsBan({ publisher: { user_id: "a", strikes: 1, banned_at: null } })).toBe(false);
    expect(suggestsBan({ publisher: { user_id: "a", strikes: 5, banned_at: "2026-10-28T00:00:00Z" } })).toBe(false);
    expect(suggestsBan({ publisher: null })).toBe(false);
  });
});

describe("the studio-moderate client", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("asks for the queue and sends an action with its reason and trimmed note", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [], removed: [] }) });
    expect(await fetchModerationQueue("tok")).toEqual({ items: [], removed: [] });
    expect(fetchMock.mock.calls[0][0]).toBe("https://x.supabase.co/functions/v1/studio-moderate");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "queue" });
    await moderatePuzzle("tok", "ban", "row-1", "copied", "  from a book ");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "ban", puzzleId: "row-1", reason: "copied", note: "from a book" });
    await moderatePuzzle("tok", "dismiss", "row-2");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ action: "dismiss", puzzleId: "row-2" });
  });

  it("turns a 401 into the token error and any other failure into a message", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await expect(fetchModerationQueue("bad")).rejects.toMatchObject({ kind: "token" });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "internal" }) });
    await expect(moderatePuzzle("tok", "restore", "row-1")).rejects.toMatchObject({ kind: "failed", message: "Moderation request failed (internal)." });
  });
});
