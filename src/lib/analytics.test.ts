// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { track, trackPageView } from "./analytics";

describe("analytics", () => {
  afterEach(() => {
    delete (window as { gtag?: unknown }).gtag;
    vi.restoreAllMocks();
  });

  it("no-ops when gtag is absent", () => {
    delete (window as { gtag?: unknown }).gtag;
    expect(() => track("mode_selected", { mode: "solo" })).not.toThrow();
    expect(() => trackPageView("/menu")).not.toThrow();
  });

  describe("with gtag present", () => {
    let gtag: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      gtag = vi.fn();
      (window as { gtag?: unknown }).gtag = gtag;
    });

    it("emits an event with cleaned params", () => {
      track("puzzle_imported", { source: "url", title: "Mon Puzzle", size: undefined });
      expect(gtag).toHaveBeenCalledWith("event", "puzzle_imported", {
        source: "url",
        title: "Mon Puzzle",
      });
    });

    it("drops only undefined params, keeps falsy values", () => {
      track("game_started", { player_count: 0, lockout: 0, narrator: undefined });
      expect(gtag).toHaveBeenCalledWith("event", "game_started", {
        player_count: 0,
        lockout: 0,
      });
    });

    it("emits a page_view with page_path", () => {
      trackPageView("/solo/play");
      expect(gtag).toHaveBeenCalledWith(
        "event",
        "page_view",
        expect.objectContaining({ page_path: "/solo/play" }),
      );
    });

    it("never throws if gtag itself throws", () => {
      gtag.mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(() => track("narrator_enabled", { engine: "claude" })).not.toThrow();
    });
  });
});
