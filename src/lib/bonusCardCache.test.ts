import { beforeEach, describe, expect, it, vi } from "vitest";

const answer = vi.hoisted(() => ({ data: [] as unknown[], error: null as unknown }));
vi.mock("./supabaseClient", () => ({
  supabase: { from: () => ({ select: () => ({ order: () => ({ limit: async () => answer }) }) }) },
}));

import { cachedBonusCards, clearBonusCardCache, fetchBonusCards } from "./bonus";

describe("the Daily Plus cards between visits", () => {
  beforeEach(() => {
    clearBonusCardCache();
    answer.error = null;
  });

  it("keeps the last answer for a screen opened again, and through a failed read", async () => {
    expect(cachedBonusCards(120)).toBeNull();
    answer.data = [{ day: "2026-11-18", title: "Young Sleuths" }];
    await fetchBonusCards(120);
    expect(cachedBonusCards(120)).toEqual(answer.data);
    // Another limit is another list.
    expect(cachedBonusCards(60)).toBeNull();
    answer.error = { message: "offline" };
    expect(await fetchBonusCards(120)).toEqual([{ day: "2026-11-18", title: "Young Sleuths" }]);
  });
});
