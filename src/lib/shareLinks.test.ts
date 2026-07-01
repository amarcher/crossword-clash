import { describe, it, expect } from "vitest";
import { buildRaceInviteUrl, buildResultShareUrl } from "./shareLinks";

describe("buildRaceInviteUrl", () => {
  it("builds a /share race link with the room code uppercased", () => {
    const url = buildRaceInviteUrl("https://crosswordclash.com", { code: "abc123" });
    const u = new URL(url);
    expect(u.pathname).toBe("/share");
    expect(u.searchParams.get("t")).toBe("race");
    expect(u.searchParams.get("code")).toBe("ABC123");
  });

  it("includes the title when provided and strips trailing slashes from origin", () => {
    const url = buildRaceInviteUrl("https://crosswordclash.com/", {
      code: "XYZ789",
      title: "Daily Mini",
    });
    expect(url.startsWith("https://crosswordclash.com/share?")).toBe(true);
    expect(new URL(url).searchParams.get("title")).toBe("Daily Mini");
  });

  it("clamps oversized codes to 6 chars", () => {
    const url = buildRaceInviteUrl("https://x.test", { code: "ABCDEFGHIJ" });
    expect(new URL(url).searchParams.get("code")).toBe("ABCDEF");
  });
});

describe("buildResultShareUrl", () => {
  it("encodes title + formatted time", () => {
    const url = buildResultShareUrl("https://crosswordclash.com", {
      title: "Checkmate",
      seconds: 102,
    });
    const u = new URL(url);
    expect(u.pathname).toBe("/share");
    expect(u.searchParams.get("t")).toBe("result");
    expect(u.searchParams.get("title")).toBe("Checkmate");
    expect(u.searchParams.get("time")).toBe("1:42");
  });

  it("includes rank/total only when both are valid", () => {
    const withRank = new URL(
      buildResultShareUrl("https://x.test", { seconds: 60, rank: 2, total: 4 }),
    );
    expect(withRank.searchParams.get("rank")).toBe("2");
    expect(withRank.searchParams.get("total")).toBe("4");

    const badRank = new URL(
      buildResultShareUrl("https://x.test", { seconds: 60, rank: 5, total: 4 }),
    );
    expect(badRank.searchParams.get("rank")).toBeNull();
    expect(badRank.searchParams.get("total")).toBeNull();
  });

  it("omits invalid times and clamps long titles", () => {
    const url = new URL(
      buildResultShareUrl("https://x.test", { title: "x".repeat(200), seconds: -1 }),
    );
    expect(url.searchParams.get("time")).toBeNull();
    expect(url.searchParams.get("title")!.length).toBeLessThanOrEqual(80);
  });

  it("URL-encodes special characters safely", () => {
    const url = buildResultShareUrl("https://x.test", {
      title: 'Fun & "Games" <tag>',
      seconds: 61,
    });
    const u = new URL(url);
    expect(u.searchParams.get("title")).toBe('Fun & "Games" <tag>');
    expect(url).not.toContain("<");
  });
});
