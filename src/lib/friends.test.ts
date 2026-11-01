// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// A chainable PostgREST fake (the community client test's pattern): every call
// records itself; awaiting the chain resolves with the next scripted result.
const calls: { table: string; op: string; args: unknown[] }[] = [];
let results: { data: unknown; error: unknown }[] = [];
const rpcCalls: { fn: string; args: unknown }[] = [];
const channels: { name: string; sent: unknown[]; removed: boolean; handlers: Array<() => void> }[] = [];
function chain(table: string) {
  const api: Record<string, unknown> = {};
  for (const op of ["select", "eq", "neq", "or", "ilike", "order", "limit", "delete", "insert"]) {
    api[op] = (...args: unknown[]) => {
      calls.push({ table, op, args });
      return api;
    };
  }
  api.then = (resolve: (v: unknown) => unknown) => Promise.resolve(results.shift() ?? { data: [], error: null }).then(resolve);
  return api;
}
vi.mock("./supabaseClient", () => ({
  supabase: {
    from: (table: string) => chain(table),
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(results.shift() ?? { data: null, error: null });
    },
    channel: (name: string) => {
      const record = { name, sent: [] as unknown[], removed: false, handlers: [] as Array<() => void> };
      channels.push(record);
      const ch = {
        on: (_type: string, _filter: unknown, handler: () => void) => {
          record.handlers.push(handler);
          return ch;
        },
        subscribe: (cb?: (status: string) => void) => {
          cb?.("SUBSCRIBED");
          return ch;
        },
        send: (msg: unknown) => {
          record.sent.push(msg);
          return Promise.resolve("ok");
        },
      };
      return ch;
    },
    removeChannel: (ch: unknown) => {
      const found = channels.find((c) => c.name === (ch as { topic?: string }).topic) ?? channels[channels.length - 1];
      if (found) found.removed = true;
      return Promise.resolve("ok");
    },
  },
}));

const friends = await import("./friends");
const {
  blockUser,
  fetchFriendships,
  fetchInvites,
  fetchRecentOpponents,
  friendsEnabled,
  friendsErrorKind,
  inviteJoinPath,
  inviteState,
  inviteToRoom,
  raceBlocks,
  searchUsernames,
  sendBeat,
  sendFriendRequest,
  setPendingChallenge,
  splitFriendships,
  subscribeInvites,
  takePendingChallenge,
  toRoomInvite,
} = friends;
type RoomInvite = import("./friends").RoomInvite;

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  channels.length = 0;
  results = [];
  sessionStorage.clear();
});

describe("friendsEnabled", () => {
  it("is on only with VITE_FRIENDS=1", () => {
    expect(friendsEnabled({ VITE_FRIENDS: "1" })).toBe(true);
    expect(friendsEnabled({ VITE_FRIENDS: "0" })).toBe(false);
    expect(friendsEnabled({})).toBe(false);
  });
});

describe("splitFriendships", () => {
  const row = (requester: string, recipient: string, status: "pending" | "accepted", created = "2026-10-30T00:00:00Z") => ({
    requester_id: requester,
    recipient_id: recipient,
    status,
    created_at: created,
    responded_at: status === "accepted" ? "2026-10-31T00:00:00Z" : null,
    requester: { username: requester },
    recipient: { username: recipient },
  });

  it("sorts friends by name and both request directions newest first, from either side of the row", () => {
    const out = splitFriendships(
      [
        row("me", "zed", "accepted"),
        row("alicia", "me", "accepted"),
        row("me", "milo", "pending", "2026-10-29T00:00:00Z"),
        row("me", "dana", "pending", "2026-10-30T00:00:00Z"),
        row("sam", "me", "pending"),
      ],
      "me",
    );
    expect(out.friends.map((f) => f.username)).toEqual(["alicia", "zed"]);
    expect(out.friends[0].since).toBe("2026-10-31T00:00:00Z");
    expect(out.outgoing.map((f) => f.username)).toEqual(["dana", "milo"]);
    expect(out.incoming.map((f) => f.username)).toEqual(["sam"]);
  });

  it("skips a row whose other side has no username", () => {
    const out = splitFriendships([{ ...row("me", "ghost", "accepted"), recipient: null }], "me");
    expect(out.friends).toEqual([]);
  });
});

describe("inviteState", () => {
  const invite = (status: string, ageMs = 0): Pick<RoomInvite, "kind" | "room" | "createdAt"> => ({
    kind: "room",
    room: { gameId: "g", code: "KQ7MXB", status, title: "T", width: 5, height: 5 },
    createdAt: new Date(1_800_000_000_000 - ageMs).toISOString(),
  });
  const now = 1_800_000_000_000;
  it("is open while the room waits and the invite is under an hour old, then expired", () => {
    expect(inviteState(invite("waiting"), now)).toBe("open");
    expect(inviteState(invite("waiting", 61 * 60 * 1000), now)).toBe("expired");
  });
  it("is started once the room is active or completed, closed when closed or gone, and a beat link is always open", () => {
    expect(inviteState(invite("active"), now)).toBe("started");
    expect(inviteState(invite("completed"), now)).toBe("started");
    expect(inviteState(invite("closed"), now)).toBe("closed");
    expect(inviteState({ kind: "room", room: null, createdAt: "2026-01-01T00:00:00Z" }, now)).toBe("closed");
    expect(inviteState({ kind: "beat", room: null, createdAt: "2020-01-01T00:00:00Z" }, now)).toBe("open");
  });
});

describe("raceBlocks (spec §3.6)", () => {
  it("orders the blocks by state: code first for a newcomer, friends first with friends, invites first with invites", () => {
    expect(raceBlocks({ signedIn: false, friends: 0, invites: 0 })).toEqual(["code", "start", "signIn"]);
    expect(raceBlocks({ signedIn: true, friends: 0, invites: 0 })).toEqual(["code", "start", "addFriends"]);
    expect(raceBlocks({ signedIn: true, friends: 3, invites: 0 })).toEqual(["friends", "start", "code"]);
    expect(raceBlocks({ signedIn: true, friends: 3, invites: 1 })).toEqual(["invites", "friends", "start", "code"]);
    // An invite with no friends yet (the friend was removed since): still invites first.
    expect(raceBlocks({ signedIn: true, friends: 0, invites: 1 })).toEqual(["invites", "friends", "start", "code"]);
  });
});

describe("friendsErrorKind and the pending challenge", () => {
  it("maps a refusal code and falls back to failed", () => {
    expect(friendsErrorKind("friends:cooldown")).toBe("cooldown");
    expect(friendsErrorKind("P0001: friends:rate_limited")).toBe("rate_limited");
    expect(friendsErrorKind("friends:bogus")).toBe("failed");
    expect(friendsErrorKind(null)).toBe("failed");
  });
  it("remembers the challenged friend once", () => {
    setPendingChallenge("alicia-id");
    expect(takePendingChallenge()).toBe("alicia-id");
    expect(takePendingChallenge()).toBeNull();
  });
});

describe("client", () => {
  it("reads the viewer's friendships from both sides with the usernames joined", async () => {
    results = [
      {
        data: [
          { requester_id: "me", recipient_id: "a", status: "accepted", created_at: "2026-10-01T00:00:00Z", responded_at: null, requester: { username: "me" }, recipient: { username: "alicia" } },
        ],
        error: null,
      },
    ];
    const out = await fetchFriendships("me");
    expect(out.friends).toEqual([{ userId: "a", username: "alicia", since: "2026-10-01T00:00:00Z" }]);
    expect(calls[0]).toMatchObject({ table: "friendships", op: "select" });
    expect(calls.find((c) => c.op === "or")?.args[0]).toBe("requester_id.eq.me,recipient_id.eq.me");
  });

  it("searches usernames by prefix, cleaned of an @ and junk, never for a one-letter query, and never the viewer", async () => {
    expect(await searchUsernames("@a", "me")).toEqual([]);
    expect(calls).toEqual([]);
    results = [{ data: [{ user_id: "a", username: "alicia" }], error: null }];
    expect(await searchUsernames(" @Ali-cia ", "me")).toEqual([{ userId: "a", username: "alicia" }]);
    expect(calls.find((c) => c.op === "ilike")?.args).toEqual(["username", "Alicia%"]);
    expect(calls.find((c) => c.op === "neq")?.args).toEqual(["user_id", "me"]);
  });

  it("sends a request by username through the RPC and surfaces each outcome and refusal", async () => {
    results = [{ data: "pending", error: null }, { data: "accepted", error: null }, { data: null, error: { message: "friends:cooldown" } }];
    expect(await sendFriendRequest("@Alicia ")).toBe("pending");
    expect(rpcCalls[0]).toEqual({ fn: "send_friend_request", args: { p_username: "Alicia" } });
    expect(await sendFriendRequest("milo")).toBe("accepted");
    await expect(sendFriendRequest("sam")).rejects.toMatchObject({ kind: "cooldown" });
  });

  it("reads recent opponents and maps the rows", async () => {
    results = [{ data: [{ user_id: "a", username: "alicia", games: 4, last_at: "2026-10-28T00:00:00Z" }], error: null }];
    expect(await fetchRecentOpponents()).toEqual([{ userId: "a", username: "alicia", games: 4, lastAt: "2026-10-28T00:00:00Z" }]);
    expect(rpcCalls[0].fn).toBe("recent_opponents");
  });

  it("blocks by inserting the block and dropping the pair's friendship, tolerating a repeat", async () => {
    results = [{ data: null, error: { code: "23505", message: "duplicate" } }, { data: null, error: null }];
    await blockUser("me", "a");
    expect(calls.find((c) => c.op === "insert")?.args[0]).toEqual({ blocker_id: "me", blocked_id: "a" });
    expect(calls.find((c) => c.table === "friendships" && c.op === "delete")).toBeTruthy();
  });

  it("invites through the RPC and nudges the friend's channel only when something was written", async () => {
    results = [{ data: "inv-1", error: null }, { data: null, error: null }];
    expect(await inviteToRoom("game-1", "a")).toBe("inv-1");
    expect(rpcCalls[0]).toEqual({ fn: "invite_to_room", args: { p_game_id: "game-1", p_friend: "a" } });
    expect(channels[0].name).toBe("user:a");
    expect(channels[0].sent).toEqual([{ type: "broadcast", event: "invites_changed", payload: {} }]);
    expect(await inviteToRoom("game-1", "b")).toBeNull();
    expect(channels).toHaveLength(1);
  });

  it("refuses a beat link that is not the daily challenge path before calling the server", async () => {
    await expect(sendBeat("a", "https://evil.example/x")).rejects.toMatchObject({ kind: "invalid" });
    expect(rpcCalls).toEqual([]);
    results = [{ data: "inv-2", error: null }];
    expect(await sendBeat("a", "/daily/2026-10-20/mini?beat=102&by=Archer")).toBe("inv-2");
  });

  it("maps an invite row with its room and sender, and derives the join path", async () => {
    const row = {
      id: "i1", kind: "room" as const, game_id: "g1", link: null, from_user_id: "a", to_user_id: "me", created_at: "2026-10-31T00:00:00Z", pushed_at: null, seen_at: null,
      sender: { username: "alicia" }, game: { short_code: "KQ7MXB", status: "waiting", puzzle: { title: "Birds", width: 15, height: 15 } },
    };
    const invite = toRoomInvite(row)!;
    expect(invite.room).toEqual({ gameId: "g1", code: "KQ7MXB", status: "waiting", title: "Birds", width: 15, height: 15 });
    expect(inviteJoinPath(invite)).toBe("/join?join=KQ7MXB");
    expect(toRoomInvite({ ...row, sender: null })).toBeNull();
    const beat = toRoomInvite({ ...row, kind: "beat", game_id: null, game: null, link: "/daily/2026-10-20/mini?beat=102" })!;
    expect(inviteJoinPath(beat)).toBe("/daily/2026-10-20/mini?beat=102");
    results = [{ data: [row], error: null }];
    expect((await fetchInvites("me")).map((i) => i.id)).toEqual(["i1"]);
    expect(calls.find((c) => c.op === "eq")?.args).toEqual(["to_user_id", "me"]);
  });

  it("subscribes to the viewer's channel and runs the handler on a nudge until stopped", () => {
    const onChange = vi.fn();
    const stop = subscribeInvites("me", onChange);
    expect(channels[0].name).toBe("user:me");
    channels[0].handlers.forEach((h) => h());
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    expect(channels[0].removed).toBe(true);
  });
});
