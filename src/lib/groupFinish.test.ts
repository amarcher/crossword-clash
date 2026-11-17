// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { GROUP_FINISHES_KEPT, groupFinishSeconds, recordGroupFinish } from "./groupFinish";

beforeEach(() => localStorage.clear());

describe("groupFinish", () => {
  it("remembers a room's time per puzzle, and the first finish stands", () => {
    expect(groupFinishSeconds("k")).toBeNull();
    recordGroupFinish("k", 316.4, 1);
    recordGroupFinish("k", 99, 2);
    expect(groupFinishSeconds("k")).toBe(316);
    expect(groupFinishSeconds(null)).toBeNull();
  });

  it("ignores a time that is not one, and survives unreadable storage", () => {
    recordGroupFinish("k", 0);
    recordGroupFinish("", 10);
    recordGroupFinish("k", Number.NaN);
    expect(groupFinishSeconds("k")).toBeNull();
    localStorage.setItem("crossword-clash-group-finishes", "not json");
    expect(groupFinishSeconds("k")).toBeNull();
    recordGroupFinish("k", 12);
    expect(groupFinishSeconds("k")).toBe(12);
  });

  it("keeps only the newest finishes", () => {
    for (let i = 0; i < GROUP_FINISHES_KEPT + 5; i++) recordGroupFinish(`k${i}`, 10 + i, i);
    expect(groupFinishSeconds("k0")).toBeNull();
    expect(groupFinishSeconds("k4")).toBeNull();
    expect(groupFinishSeconds("k5")).toBe(15);
    expect(groupFinishSeconds(`k${GROUP_FINISHES_KEPT + 4}`)).toBe(10 + GROUP_FINISHES_KEPT + 4);
  });
});
