// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadMpSession,
  saveMpSession,
  touchMpSession,
  clearMpSession,
  isRecentMpSession,
  loadHostSession,
  saveHostSession,
  clearHostSession,
  MP_SESSION_MAX_AGE_MS,
  MP_SESSION_RECENT_MS,
} from "./sessionPersistence";
import type { MpSession, HostSession } from "./sessionPersistence";

const HOUR = 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

beforeEach(() => {
  localStorage.clear();
});

describe("MP session persistence", () => {
  const session: Omit<MpSession, "savedAt"> = {
    gameId: "abc-123",
    shareCode: "XYZ789",
    displayName: "Alice",
  };

  it("returns null when no session is stored", () => {
    expect(loadMpSession()).toBeNull();
  });

  it("round-trips a session through save/load, stamping savedAt", () => {
    saveMpSession(session, NOW);
    expect(loadMpSession(NOW)).toEqual({ ...session, savedAt: NOW });
  });

  it("handles null shareCode", () => {
    const noCode = { ...session, shareCode: null };
    saveMpSession(noCode, NOW);
    expect(loadMpSession(NOW)).toEqual({ ...noCode, savedAt: NOW });
  });

  it("returns null for corrupted JSON", () => {
    localStorage.setItem("crossword-clash-mp", "not json{{{");
    expect(loadMpSession()).toBeNull();
  });

  it("returns null for JSON missing gameId", () => {
    localStorage.setItem("crossword-clash-mp", JSON.stringify({ version: 2, displayName: "Bob", savedAt: NOW }));
    expect(loadMpSession(NOW)).toBeNull();
  });

  it("returns null for an unknown version", () => {
    localStorage.setItem("crossword-clash-mp", JSON.stringify({ ...session, version: 99, savedAt: NOW }));
    expect(loadMpSession(NOW)).toBeNull();
  });

  it("ignores a session older than the 12 h cold-start limit", () => {
    saveMpSession(session, NOW - MP_SESSION_MAX_AGE_MS - 1);
    expect(loadMpSession(NOW)).toBeNull();
    clearMpSession(); // a re-save of the same room would keep the old stamp
    saveMpSession(session, NOW - MP_SESSION_MAX_AGE_MS);
    expect(loadMpSession(NOW)).not.toBeNull();
  });

  it("treats a pre-savedAt (v1) payload as expired rather than corrupt", () => {
    localStorage.setItem("crossword-clash-mp", JSON.stringify({ ...session, version: 1 }));
    expect(() => loadMpSession()).not.toThrow();
    expect(loadMpSession()).toBeNull();
  });

  it("re-saving the same room keeps its original savedAt", () => {
    saveMpSession(session, NOW - 2 * HOUR);
    saveMpSession({ ...session, displayName: "Alice (renamed)" }, NOW);
    expect(loadMpSession(NOW)).toEqual({ ...session, displayName: "Alice (renamed)", savedAt: NOW - 2 * HOUR });
  });

  it("saving a different room stamps a fresh savedAt", () => {
    saveMpSession(session, NOW - 2 * HOUR);
    saveMpSession({ ...session, gameId: "next-game" }, NOW);
    expect(loadMpSession(NOW)?.savedAt).toBe(NOW);
  });

  it("an explicit savedAt wins over the stored one", () => {
    saveMpSession(session, NOW - 2 * HOUR);
    saveMpSession({ ...session, savedAt: NOW - HOUR }, NOW);
    expect(loadMpSession(NOW)?.savedAt).toBe(NOW - HOUR);
  });

  it("touchMpSession renews savedAt and is a no-op without a session", () => {
    expect(() => touchMpSession(NOW)).not.toThrow();
    expect(loadMpSession(NOW)).toBeNull();
    saveMpSession(session, NOW - 2 * HOUR);
    touchMpSession(NOW);
    expect(loadMpSession(NOW)).toEqual({ ...session, savedAt: NOW });
  });

  it("touching a v1 payload upgrades it with a timestamp", () => {
    localStorage.setItem("crossword-clash-mp", JSON.stringify({ ...session, version: 1 }));
    touchMpSession(NOW);
    expect(loadMpSession(NOW)).toEqual({ ...session, savedAt: NOW });
  });

  it("isRecentMpSession is true within the hour and false after it", () => {
    expect(isRecentMpSession({ savedAt: NOW - MP_SESSION_RECENT_MS }, NOW)).toBe(true);
    expect(isRecentMpSession({ savedAt: NOW - MP_SESSION_RECENT_MS - 1 }, NOW)).toBe(false);
  });

  it("clearMpSession removes the stored session", () => {
    saveMpSession(session);
    clearMpSession();
    expect(loadMpSession()).toBeNull();
  });

  it("clearMpSession is safe when no session exists", () => {
    expect(() => clearMpSession()).not.toThrow();
  });
});

describe("Host session persistence", () => {
  const session: HostSession = {
    gameId: "def-456",
  };

  it("returns null when no session is stored", () => {
    expect(loadHostSession()).toBeNull();
  });

  it("round-trips a session through save/load", () => {
    saveHostSession(session);
    expect(loadHostSession()).toEqual(session);
  });

  it("still reads a v1 payload (the host session never changed shape)", () => {
    localStorage.setItem("crossword-clash-host", JSON.stringify({ gameId: "old", version: 1 }));
    expect(loadHostSession()).toEqual({ gameId: "old" });
  });

  it("returns null for corrupted JSON", () => {
    localStorage.setItem("crossword-clash-host", "bad data");
    expect(loadHostSession()).toBeNull();
  });

  it("returns null for JSON missing gameId", () => {
    localStorage.setItem("crossword-clash-host", JSON.stringify({ displayName: "X" }));
    expect(loadHostSession()).toBeNull();
  });

  it("clearHostSession removes the stored session", () => {
    saveHostSession(session);
    clearHostSession();
    expect(loadHostSession()).toBeNull();
  });

  it("clearHostSession is safe when no session exists", () => {
    expect(() => clearHostSession()).not.toThrow();
  });

  it("MP and host sessions are independent", () => {
    saveMpSession({ gameId: "mp-1", shareCode: "ABC", displayName: "Player" });
    saveHostSession(session);

    clearMpSession();

    expect(loadMpSession()).toBeNull();
    expect(loadHostSession()).toEqual(session);
  });
});
