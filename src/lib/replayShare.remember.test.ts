// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabaseClient", () => ({ supabase: null }));
const { rememberReplay, rememberedReplay } = await import("./replayShare");

beforeEach(() => localStorage.clear());

describe("remembered replays (a reopened solve shares with its replay)", () => {
  it("gives back a puzzle's replay for the time the share names, and nothing for another time or puzzle", () => {
    rememberReplay("k1", "VJ0ncnWyJ9j", 149.6);
    expect(rememberedReplay("k1", 149)).toBe("VJ0ncnWyJ9j");
    expect(rememberedReplay("k1", 150)).toBeNull();
    expect(rememberedReplay("k2", 149)).toBeNull();
  });

  it("keeps the fastest finish's replay when the puzzle is solved again slower, and takes a faster one", () => {
    rememberReplay("k1", "VJ0ncnWyJ9j", 149);
    rememberReplay("k1", "E0Gqr8Iw09i", 200);
    expect(rememberedReplay("k1", 149)).toBe("VJ0ncnWyJ9j");
    rememberReplay("k1", "E0Gqr8Iw09i", 120);
    expect(rememberedReplay("k1", 120)).toBe("E0Gqr8Iw09i");
  });

  it("ignores an ID that isn't one, and survives unreadable storage", () => {
    rememberReplay("k1", "nope", 10);
    expect(rememberedReplay("k1", 10)).toBeNull();
    localStorage.setItem("crossword-clash:replay-shares", "{not json");
    expect(rememberedReplay("k1", 10)).toBeNull();
    rememberReplay("k1", "VJ0ncnWyJ9j", 10);
    expect(rememberedReplay("k1", 10)).toBe("VJ0ncnWyJ9j");
  });
});
