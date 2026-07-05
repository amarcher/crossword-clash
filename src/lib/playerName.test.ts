// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  isRealPlayerName,
  loadPlayerName,
  savePlayerName,
  MAX_PLAYER_NAME_LENGTH,
} from "./playerName";

describe("isRealPlayerName", () => {
  it("rejects empty, whitespace, null, and undefined", () => {
    expect(isRealPlayerName("")).toBe(false);
    expect(isRealPlayerName("   ")).toBe(false);
    expect(isRealPlayerName(null)).toBe(false);
    expect(isRealPlayerName(undefined)).toBe(false);
  });

  it("rejects the anonymous default in every supported language", () => {
    expect(isRealPlayerName("Player")).toBe(false);
    expect(isRealPlayerName("Jugador")).toBe(false);
    expect(isRealPlayerName("  Player  ")).toBe(false);
  });

  it("accepts a real chosen name", () => {
    expect(isRealPlayerName("Andy")).toBe(true);
    expect(isRealPlayerName("Player One")).toBe(true);
  });
});

describe("savePlayerName / loadPlayerName", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing was ever saved", () => {
    expect(loadPlayerName()).toBeNull();
  });

  it("round-trips a saved name", () => {
    savePlayerName("Andy");
    expect(loadPlayerName()).toBe("Andy");
  });

  it("trims surrounding whitespace", () => {
    savePlayerName("  Andy  ");
    expect(loadPlayerName()).toBe("Andy");
  });

  it("caps at the max name length", () => {
    savePlayerName("A".repeat(50));
    expect(loadPlayerName()).toBe("A".repeat(MAX_PLAYER_NAME_LENGTH));
  });

  it("does not save empty or default names", () => {
    savePlayerName("   ");
    expect(loadPlayerName()).toBeNull();
    savePlayerName("Player");
    expect(loadPlayerName()).toBeNull();
    savePlayerName("Jugador");
    expect(loadPlayerName()).toBeNull();
  });

  it("keeps the previous name when a later save is invalid", () => {
    savePlayerName("Andy");
    savePlayerName("");
    expect(loadPlayerName()).toBe("Andy");
  });

  it("treats a stored default (corruption/legacy) as absent", () => {
    localStorage.setItem("crossword-clash:name", "Player");
    expect(loadPlayerName()).toBeNull();
  });
});
