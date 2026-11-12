import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const rows = vi.hoisted(() => ({ data: [] as unknown[], error: null as unknown }));
vi.mock("./supabaseClient", () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: async () => rows,
    maybeSingle: async () => ({ data: rows.data[0] ?? null, error: rows.error }),
  };
  return { supabase: { rpc, from: () => chain } };
});

const { fetchRaceReplies, fetchRaceReply, replyToRace } = await import("./raceReplies");

afterEach(() => {
  rpc.mockReset();
  rows.data = [];
  rows.error = null;
});

const row = { id: "0a1b2c3d-4e5f-6789-abcd-ef0123456789", share_id: "E0Gqr8Iw09i", name: "Sam", day: "2026-11-12", slot: "mini", seconds: 90, to_seconds: 102, reply_share_id: "VJ0ncnWyJ9j", created_at: "2026-11-12T20:00:00Z", seen_at: null };

describe("race replies", () => {
  it("files the reply with whole seconds", async () => {
    rpc.mockResolvedValueOnce({ data: row.id, error: null });
    expect(await replyToRace({ shareId: "E0Gqr8Iw09i", replyShareId: "VJ0ncnWyJ9j", name: "Sam", day: "2026-11-12", slot: "mini", seconds: 90.7, toSeconds: 102.2 })).toBe(row.id);
    expect(rpc).toHaveBeenCalledWith("reply_to_race", { p_share_id: "E0Gqr8Iw09i", p_reply_share_id: "VJ0ncnWyJ9j", p_name: "Sam", p_day: "2026-11-12", p_slot: "mini", p_seconds: 90, p_to_seconds: 102 });
  });

  it("gives null when the reply can't be filed", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "replies:rate_limited" } });
    expect(await replyToRace({ shareId: "E0Gqr8Iw09i", replyShareId: null, name: "Sam", day: "2026-11-12", slot: "mini", seconds: 1, toSeconds: 2 })).toBeNull();
  });

  it("reads replies as the screens use them, dropping a row with an unknown slot", async () => {
    rows.data = [row, { ...row, id: "x", slot: "huge" }];
    expect(await fetchRaceReplies("u1")).toEqual([
      { id: row.id, shareId: "E0Gqr8Iw09i", name: "Sam", day: "2026-11-12", slot: "mini", seconds: 90, toSeconds: 102, replyShareId: "VJ0ncnWyJ9j", createdAt: row.created_at, seen: false },
    ]);
  });

  it("reads one reply by id, and nothing for an id that isn't one", async () => {
    rows.data = [row];
    expect((await fetchRaceReply(row.id))?.name).toBe("Sam");
    expect(await fetchRaceReply("nope")).toBeNull();
  });
});
