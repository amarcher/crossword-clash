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

  it("returns the same player objects when nothing changes", () => {
    const roster = liveRoster([host, me], [host, me], { userId: "me", displayName: "Archer" });
    expect(roster[0]).toBe(host);
    expect(roster[1]).toBe(me);
  });
});
