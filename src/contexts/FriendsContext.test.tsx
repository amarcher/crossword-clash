import { describe, expect, it } from "vitest";
import { newlyAccepted } from "./FriendsContext";
import type { Friendships } from "../lib/friends";

/**
 * The accept notice (Andrew, 2026-11-03: the requester saw nothing until a
 * relaunch): a request listed as outgoing at the last load and as a friend
 * now was accepted meanwhile.
 */
const friend = (userId: string) => ({ userId, username: userId, since: "2026-11-03T00:00:00Z" });
const request = (userId: string) => ({ userId, username: userId, createdAt: "2026-11-02T00:00:00Z" });
const state = (over: Partial<Friendships>): Friendships => ({ friends: [], incoming: [], outgoing: [], ...over });

describe("newlyAccepted", () => {
  it("names the outgoing requests the new load lists as friends, and nobody else", () => {
    const before = state({ outgoing: [request("alicia"), request("milo")], friends: [friend("zed")] });
    const after = state({ friends: [friend("zed"), friend("alicia")], outgoing: [request("milo")] });
    expect(newlyAccepted(before, after).map((f) => f.userId)).toEqual(["alicia"]);
    // A friend who was already one, a request still pending, or one that was declined: nothing.
    expect(newlyAccepted(after, after)).toEqual([]);
    expect(newlyAccepted(before, state({ friends: [friend("zed")] }))).toEqual([]);
    expect(newlyAccepted(state({}), state({ friends: [friend("alicia")] }))).toEqual([]);
  });
});
