// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadMpSession,
  saveMpSession,
  clearMpSession,
  loadHostSession,
  saveHostSession,
  clearHostSession,
} from "./sessionPersistence";
import type { MpSession, HostSession } from "./sessionPersistence";

beforeEach(() => {
  localStorage.clear();
});

describe("MP session persistence", () => {
  const session: MpSession = {
    gameId: "abc-123",
    shareCode: "XYZ789",
    displayName: "Alice",
  };

  it("returns null when no session is stored", () => {
    expect(loadMpSession()).toBeNull();
  });

  it("round-trips a session through save/load", () => {
    saveMpSession(session);
    expect(loadMpSession()).toEqual(session);
  });

  it("handles null shareCode", () => {
    const noCode: MpSession = { ...session, shareCode: null };
    saveMpSession(noCode);
    expect(loadMpSession()).toEqual(noCode);
  });

  it("returns null for corrupted JSON", () => {
    localStorage.setItem("crossword-clash-mp", "not json{{{");
    expect(loadMpSession()).toBeNull();
  });

  it("returns null for JSON missing gameId", () => {
    localStorage.setItem("crossword-clash-mp", JSON.stringify({ displayName: "Bob" }));
    expect(loadMpSession()).toBeNull();
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
    displayName: "Host",
  };

  it("returns null when no session is stored", () => {
    expect(loadHostSession()).toBeNull();
  });

  it("round-trips a session through save/load", () => {
    saveHostSession(session);
    expect(loadHostSession()).toEqual(session);
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
