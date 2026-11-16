import { describe, it, expect } from "vitest";
import { WRONG_ANSWER_TIMEOUT_OPTIONS, DEFAULT_GAME_SETTINGS, resolvePuzzleRef } from "./gameSettings";

describe("gameSettings", () => {
  describe("WRONG_ANSWER_TIMEOUT_OPTIONS", () => {
    it("has 5 options", () => {
      expect(WRONG_ANSWER_TIMEOUT_OPTIONS).toHaveLength(5);
    });

    it("starts with Off (0)", () => {
      expect(WRONG_ANSWER_TIMEOUT_OPTIONS[0]).toEqual({ label: "Off", value: 0 });
    });

    it("has strictly increasing values", () => {
      for (let i = 1; i < WRONG_ANSWER_TIMEOUT_OPTIONS.length; i++) {
        expect(WRONG_ANSWER_TIMEOUT_OPTIONS[i].value).toBeGreaterThan(
          WRONG_ANSWER_TIMEOUT_OPTIONS[i - 1].value,
        );
      }
    });

    it("all values are non-negative integers", () => {
      for (const opt of WRONG_ANSWER_TIMEOUT_OPTIONS) {
        expect(opt.value).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(opt.value)).toBe(true);
      }
    });

    it("all labels are non-empty strings", () => {
      for (const opt of WRONG_ANSWER_TIMEOUT_OPTIONS) {
        expect(opt.label.length).toBeGreaterThan(0);
      }
    });
  });

  describe("DEFAULT_GAME_SETTINGS", () => {
    it("defaults to no timeout", () => {
      expect(DEFAULT_GAME_SETTINGS.wrongAnswerTimeoutSeconds).toBe(0);
    });
  });
});

describe("resolvePuzzleRef", () => {
  it("reads a past daily's or a community puzzle's link from the room's settings", () => {
    expect(resolvePuzzleRef({ wrongAnswerTimeoutSeconds: 0, puzzleRef: { day: "2026-11-03", slot: "midi" } })).toEqual({ day: "2026-11-03", slot: "midi" });
    expect(resolvePuzzleRef({ puzzleRef: { shortId: "ab12cd34" } })).toEqual({ shortId: "ab12cd34" });
  });

  it("takes nothing that is not a link: settings come from the database and other players", () => {
    for (const bad of [null, undefined, {}, { puzzleRef: "x" }, { puzzleRef: { day: "yesterday", slot: "mini" } }, { puzzleRef: { day: "2026-11-03", slot: "huge" } }, { puzzleRef: { shortId: "../etc" } }, { puzzleRef: { shortId: "" } }]) {
      expect(resolvePuzzleRef(bad)).toBeUndefined();
    }
  });
});
