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
  for (const op of ["select", "eq", "neq", "in", "or", "ilike", "order", "limit", "delete", "insert", "maybeSingle"]) {
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
  declineRoomInvite,
  fetchFriendships,
  fetchInvites,
  fetchPlayerProfiles,
  fetchRoomJoined,
  fetchSentInvites,
  formatCountdown,
  lobbyInviteStatus,
  nextNudgeAt,
  notifyRoomJoined,
  nudgeHost,
  retryAfterSeconds,
  NUDGE_BACKOFF_MS,
  fetchRecentOpponents,
  fetchFriendSolves,
  solveChip,
  friendsEnabled,
  friendSuggestions,
  friendsErrorKind,
  inviteJoinPath,
  inviteState,
  inviteToRoom,
  raceBlocks,
  searchUsernames,
  sendBeat,
  sendFriendRequest,
  respondFriendRequest,
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
    expect(raceBlocks({ signedIn: false, friends: 0, invites: 0, requests: 0 })).toEqual(["code", "start", "signIn"]);
    expect(raceBlocks({ signedIn: true, friends: 0, invites: 0, requests: 0 })).toEqual(["code", "start", "addFriends"]);
    expect(raceBlocks({ signedIn: true, friends: 3, invites: 0, requests: 0 })).toEqual(["friends", "start", "code"]);
    expect(raceBlocks({ signedIn: true, friends: 3, invites: 1, requests: 0 })).toEqual(["invites", "friends", "start", "code"]);
    // A first request with no friends yet: the friends block carries the "1 request" link.
    expect(raceBlocks({ signedIn: true, friends: 0, invites: 0, requests: 1 })).toEqual(["friends", "start", "code"]);
    // An invite with no friends yet (the friend was removed since): still invites first.
    expect(raceBlocks({ signedIn: true, friends: 0, invites: 1, requests: 0 })).toEqual(["invites", "friends", "start", "code"]);
  });
});

describe("friendSuggestions", () => {
  const person = (id: string) => ({ userId: id, username: id });
  const friendships = {
    friends: [{ ...person("alicia"), since: "2026-10-01T00:00:00Z" }],
    incoming: [{ ...person("sam"), createdAt: "2026-10-30T00:00:00Z" }],
    outgoing: [{ ...person("dana"), createdAt: "2026-10-30T00:00:00Z" }],
  };

  it("keeps the room's other accounts in standings order, dropping the viewer, friends, pending requests either way and blocked players", () => {
    const players = [person("zed"), person("me"), person("alicia"), person("sam"), person("dana"), person("kai"), person("milo")];
    expect(friendSuggestions(players, friendships, ["kai"], "me").map((p) => p.username)).toEqual(["zed", "milo"]);
  });

  it("lists a player once however many rows they held, and nobody when everyone is known", () => {
    expect(friendSuggestions([person("zed"), person("zed")], friendships, [], "me")).toEqual([person("zed")]);
    expect(friendSuggestions([person("me"), person("alicia")], friendships, [], "me")).toEqual([]);
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

  it("builds and reads the add-me link, and finds the account a username belongs to", async () => {
    expect(friends.friendLinkPath("archer_1")).toBe("/add/archer_1");
    expect(friends.friendLink("archer_1")).toBe(`${window.location.origin}/add/archer_1`);
    expect(friends.friendLinkUsername("archer_1")).toBe("archer_1");
    expect(friends.friendLinkUsername(" @Archer ")).toBe("Archer");
    for (const bad of [null, undefined, "", "ab", "a".repeat(21), "arch er", "arch/er", "árcher"]) {
      expect(friends.friendLinkUsername(bad)).toBeNull();
    }

    results = [{ data: { user_id: "a", username: "Alicia" }, error: null }, { data: null, error: null }];
    expect(await friends.fetchProfileByUsername("ALICIA")).toEqual({ userId: "a", username: "Alicia" });
    expect(calls.find((c) => c.op === "eq")?.args).toEqual(["username_lower", "alicia"]);
    expect(await friends.fetchProfileByUsername("nobody")).toBeNull();
  });

  it("sends a request by username through the RPC, nudges the recipient's channel, and surfaces each outcome and refusal", async () => {
    // Each request is the RPC answer, then the public profile lookup that finds the channel to nudge.
    results = [
      { data: "pending", error: null },
      { data: [{ user_id: "a" }], error: null },
      { data: "accepted", error: null },
      { data: [], error: null },
      { data: null, error: { message: "friends:cooldown" } },
    ];
    expect(await sendFriendRequest("@Alicia ")).toBe("pending");
    expect(rpcCalls[0]).toEqual({ fn: "send_friend_request", args: { p_username: "Alicia" } });
    expect(calls.find((c) => c.table === "profiles" && c.op === "eq")?.args).toEqual(["username_lower", "alicia"]);
    expect(channels.map((c) => c.name)).toEqual(["user:a"]);
    expect(channels[0].sent).toHaveLength(1);
    // No profile row (a race with a rename): the request went through, nobody is nudged.
    expect(await sendFriendRequest("milo")).toBe("accepted");
    expect(channels).toHaveLength(1);
    await expect(sendFriendRequest("sam")).rejects.toMatchObject({ kind: "cooldown" });
    expect(calls.filter((c) => c.table === "profiles" && c.op === "select")).toHaveLength(2);
  });

  it("reads the usernames behind a room's ids in the ids' order, skipping anonymous players and asking nothing for an empty room", async () => {
    results = [{ data: [{ user_id: "b", username: "bea" }, { user_id: "a", username: "al" }], error: null }];
    expect(await fetchPlayerProfiles(["a", "anon", "b", "a"])).toEqual([
      { userId: "a", username: "al" },
      { userId: "b", username: "bea" },
    ]);
    expect(calls.find((c) => c.op === "in")?.args).toEqual(["user_id", ["a", "anon", "b"]]);
    calls.length = 0;
    expect(await fetchPlayerProfiles([])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("reads which friends finished a puzzle through the RPC, keyed by user id, and names each finish's chip", async () => {
    results = [{ data: [{ user_id: "a", mode: "solo", completed_day: "2026-11-03" }, { user_id: "m", mode: "versus", completed_day: "2026-11-02" }], error: null }];
    const solves = await fetchFriendSolves("civics class|9x9|abc");
    expect(rpcCalls[0]).toEqual({ fn: "friend_solves", args: { p_puzzle_key: "civics class|9x9|abc" } });
    expect(solves).toEqual({ a: { mode: "solo", day: "2026-11-03" }, m: { mode: "versus", day: "2026-11-02" } });
    expect(solveChip(solves.a)).toBe("solved");
    expect(solveChip(solves.m)).toBe("raced");
    expect(solveChip({ mode: "coop", day: "2026-11-01" })).toBe("raced");
    expect(solveChip({ mode: "import", day: "2026-11-01" })).toBeNull();
    expect(solveChip(undefined)).toBeNull();
    results = [{ data: null, error: { message: "friends:not_signed_in" } }];
    await expect(fetchFriendSolves("x")).rejects.toMatchObject({ kind: "not_signed_in" });
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

  it("answers a request through the RPC and nudges the requester's channel on an accept, not on a decline", async () => {
    results = [{ data: null, error: null }, { data: null, error: null }];
    await respondFriendRequest("a", true);
    expect(rpcCalls[0]).toEqual({ fn: "respond_friend_request", args: { p_requester: "a", p_accept: true } });
    expect(channels.map((c) => c.name)).toEqual(["user:a"]);
    expect(channels[0].sent).toEqual([{ type: "broadcast", event: "invites_changed", payload: {} }]);
    await respondFriendRequest("b", false);
    expect(channels).toHaveLength(1);
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
      id: "i1", kind: "room" as const, game_id: "g1", link: null, from_user_id: "a", to_user_id: "me", created_at: "2026-10-31T00:00:00Z", pushed_at: null, seen_at: null, response: null,
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

  it("hands a room_joined nudge's game id to its own handler, ignoring a payload without one", () => {
    const onChange = vi.fn();
    const onRoomJoined = vi.fn();
    subscribeInvites("me", onChange, onRoomJoined);
    const [invites, joined] = channels[0].handlers as unknown as Array<(msg?: unknown) => void>;
    joined({ payload: { gameId: "g1" } });
    joined({ payload: {} });
    joined();
    expect(onRoomJoined).toHaveBeenCalledTimes(1);
    expect(onRoomJoined).toHaveBeenCalledWith("g1");
    invites();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("room rendezvous (phase f)", () => {
  const sent = (toUserId: string, response: "declined" | null = null, gameId = "g1") => ({ id: `i-${toUserId}`, gameId, toUserId, createdAt: "2026-11-02T00:00:00Z", response });

  it("lobbyInviteStatus: Joined beats everything, then declined, then invited, else nothing", () => {
    const roster = [{ userId: "host" }, { userId: "a" }];
    expect(lobbyInviteStatus("a", "g1", [sent("a", "declined")], roster)).toBe("joined");
    expect(lobbyInviteStatus("b", "g1", [sent("b", "declined")], roster)).toBe("declined");
    expect(lobbyInviteStatus("b", "g1", [sent("b")], roster)).toBe("invited");
    expect(lobbyInviteStatus("b", "g1", [sent("b", null, "other-room")], roster)).toBe("none");
    expect(lobbyInviteStatus("b", "g1", [], roster)).toBe("none");
  });

  it("a declined invite is no longer open", () => {
    const base = { kind: "room" as const, room: { gameId: "g1", code: "K", status: "waiting", title: "", width: 5, height: 5 }, createdAt: new Date().toISOString() };
    expect(inviteState(base)).toBe("open");
    expect(inviteState({ ...base, response: "declined" })).toBe("declined");
  });

  it("notifyRoomJoined nudges the host's channel with the game id", () => {
    notifyRoomJoined("host", "g1");
    expect(channels[0].name).toBe("user:host");
    expect(channels[0].sent).toEqual([{ type: "broadcast", event: "room_joined", payload: { gameId: "g1" } }]);
  });

  it("fetchSentInvites reads the viewer's own room invites with their response", async () => {
    results = [{ data: [{ id: "i1", game_id: "g1", to_user_id: "a", created_at: "2026-11-02T00:00:00Z", response: "declined" }, { id: "i2", game_id: null, to_user_id: "b", created_at: "x", response: null }], error: null }];
    expect(await fetchSentInvites("me")).toEqual([{ id: "i1", gameId: "g1", toUserId: "a", createdAt: "2026-11-02T00:00:00Z", response: "declined" }]);
    expect(calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([["from_user_id", "me"], ["kind", "room"]]);
  });

  it("fetchRoomJoined reads the room back and refuses one the viewer does not host or that is no longer waiting", async () => {
    results = [
      { data: { id: "g1", short_code: "KQ7MXB", status: "waiting", host_user_id: "me", puzzle: { title: "Birds" } }, error: null },
      { data: [{ user_id: "a" }], error: null },
      { data: [{ user_id: "a", username: "alicia" }], error: null },
    ];
    expect(await fetchRoomJoined("g1", "me", 5)).toEqual({ gameId: "g1", code: "KQ7MXB", title: "Birds", joinerName: "alicia", at: 5 });
    // An anonymous joiner has no profile: the notice still fires, nameless.
    results = [
      { data: { id: "g1", short_code: "KQ7MXB", status: "waiting", host_user_id: "me", puzzle: null }, error: null },
      { data: [{ user_id: "anon" }], error: null },
      { data: [], error: null },
    ];
    expect(await fetchRoomJoined("g1", "me", 5)).toEqual({ gameId: "g1", code: "KQ7MXB", title: "", joinerName: null, at: 5 });
    results = [{ data: { id: "g1", short_code: "KQ7MXB", status: "waiting", host_user_id: "someone-else", puzzle: null }, error: null }];
    expect(await fetchRoomJoined("g1", "me")).toBeNull();
    results = [{ data: { id: "g1", short_code: "KQ7MXB", status: "active", host_user_id: "me", puzzle: null }, error: null }];
    expect(await fetchRoomJoined("g1", "me")).toBeNull();
  });

  it("declineRoomInvite calls the RPC with 'declined' and nudges the sender", async () => {
    results = [{ data: null, error: null }];
    await declineRoomInvite({ id: "i1", from: { userId: "a", username: "alicia" } });
    expect(rpcCalls[0]).toEqual({ fn: "respond_room_invite", args: { p_invite: "i1", p_response: "declined" } });
    expect(channels[0].name).toBe("user:a");
    results = [{ data: null, error: { message: "friends:not_found" } }];
    await expect(declineRoomInvite({ id: "i2", from: { userId: "a", username: "alicia" } })).rejects.toMatchObject({ kind: "not_found" });
  });

  it("the nudge ladder: the first nudge of a spell is free, then 1, 2, 4, 8 minutes capped at 15, counted from the last one", () => {
    expect(NUDGE_BACKOFF_MS).toEqual([60_000, 120_000, 240_000, 480_000, 900_000]);
    expect(nextNudgeAt(0, null)).toBe(0);
    expect(nextNudgeAt(0, 1_000)).toBe(0);
    expect(nextNudgeAt(1, null)).toBe(0);
    expect(nextNudgeAt(1, 1_000)).toBe(61_000);
    expect(nextNudgeAt(2, 1_000)).toBe(121_000);
    expect(nextNudgeAt(3, 1_000)).toBe(241_000);
    expect(nextNudgeAt(4, 1_000)).toBe(481_000);
    expect(nextNudgeAt(5, 1_000)).toBe(901_000);
    expect(nextNudgeAt(12, 1_000)).toBe(901_000);
    expect(formatCountdown(102_000)).toBe("1:42");
    expect(formatCountdown(100)).toBe("0:01");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("nudgeHost sends the spell's start, answers the next wait, and a too-soon refusal carries the seconds left", async () => {
    results = [{ data: { id: "n1", nextInSeconds: 120 }, error: null }];
    expect(await nudgeHost("g1", Date.UTC(2026, 10, 2, 12, 0, 0))).toEqual({ id: "n1", nextInSeconds: 120 });
    expect(rpcCalls[rpcCalls.length - 1]).toEqual({ fn: "nudge_host", args: { p_game_id: "g1", p_spell: "2026-11-02T12:00:00.000Z" } });
    // A block: no id, still a wait.
    results = [{ data: { id: null, nextInSeconds: 60 }, error: null }];
    expect(await nudgeHost("g1", 0)).toEqual({ id: null, nextInSeconds: 60 });
    results = [{ data: null, error: { message: "friends:too_soon:102" } }];
    await expect(nudgeHost("g1", 0)).rejects.toMatchObject({ kind: "too_soon", retryAfterSeconds: 102 });
    expect(retryAfterSeconds("friends:too_soon:7")).toBe(7);
    expect(retryAfterSeconds("friends:too_soon")).toBeNull();
    expect(retryAfterSeconds("friends:rate_limited")).toBeNull();
  });
});
