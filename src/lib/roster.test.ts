import { describe, expect, it } from "vitest";
import { liveRoster } from "./roster";
import type { Player } from "../types/game";

const p = (userId: string, displayName: string, color = "#000"): Player => ({ id: userId, gameId: "g1", userId, displayName, color, score: 0 });
const host = p("host", "Alicia", "#ef4444");
const me = p("me", "Archer", "#3b82f6");
const names = (roster: Player[]) => roster.map((r) => r.displayName);

describe("liveRoster", () => {
  it("shows the DB rows until presence has warmed", () => {
    expect(names(liveRoster(null, [host, me]))).toEqual(["Alicia", "Archer"]);
  });

  it("is presence membership in DB order once warmed, presence-only players after", () => {
    const late = p("late", "Bo");
    expect(names(liveRoster([late, me, host], [host, me]))).toEqual(["Alicia", "Archer", "Bo"]);
    // A player gone from presence is gone from the roster, whatever the DB still holds.
    expect(names(liveRoster([me], [host, me]))).toEqual(["Archer"]);
    // Everyone left.
    expect(liveRoster([], [host, me])).toEqual([]);
  });

  it("carries the name the local player typed on their row, from either source", () => {
    const self = { userId: "me", displayName: "Arch" };
    expect(names(liveRoster(null, [host, me], self))).toEqual(["Alicia", "Arch"]);
    expect(names(liveRoster([me, host], [host, me], self))).toEqual(["Alicia", "Arch"]);
    // Other players' rows are untouched, and the row keeps its colour.
    expect(liveRoster([host, me], [host, me], self)[1]).toEqual({ ...me, displayName: "Arch" });
  });

  it("leaves the row alone for a blank typed name and filters an objectionable one", () => {
    expect(names(liveRoster(null, [me], { userId: "me", displayName: "  " }))).toEqual(["Archer"]);
    expect(names(liveRoster(null, [me], { userId: "me", displayName: "shithead" }))).toEqual(["Player"]);
  });

  it("carries presence's away flag through the DB-order sort and the local rename; a DB row is never away", () => {
    const awayHost = { ...host, away: true };
    const roster = liveRoster([me, awayHost], [host, me], { userId: "me", displayName: "Arch" });
    expect(roster.map((r) => [r.displayName, r.away ?? false])).toEqual([
      ["Alicia", true],
      ["Arch", false],
    ]);
    expect(liveRoster(null, [host, me]).every((r) => r.away === undefined)).toBe(true);
    // The local player's own flag survives the rename.
    expect(liveRoster([{ ...me, away: true }], [me], { userId: "me", displayName: "Arch" })[0]).toMatchObject({ displayName: "Arch", away: true });
  });

  it("returns the same player objects when nothing changes", () => {
    const roster = liveRoster([host, me], [host, me], { userId: "me", displayName: "Archer" });
    expect(roster[0]).toBe(host);
    expect(roster[1]).toBe(me);
  });
});
