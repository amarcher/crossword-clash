import { describe, it, expect } from "vitest";
import { getPlayerColor, PLAYER_COLORS } from "./playerColors";

describe("playerColors", () => {
  it("returns distinct colors for indices 0-7", () => {
    const colors = new Set<string>();
    for (let i = 0; i < 8; i++) {
      colors.add(getPlayerColor(i));
    }
    expect(colors.size).toBe(8);
  });

  it("wraps around after 8 players", () => {
    expect(getPlayerColor(8)).toBe(getPlayerColor(0));
    expect(getPlayerColor(9)).toBe(getPlayerColor(1));
  });

  it("returns valid hex colors", () => {
    for (const color of PLAYER_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("returns the first color for index 0", () => {
    expect(getPlayerColor(0)).toBe(PLAYER_COLORS[0]);
  });
});
