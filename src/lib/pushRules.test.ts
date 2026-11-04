import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  apnsRequest,
  apnsTokenClaims,
  apnsTokenStale,
  beatNotification,
  DEFAULT_PUSH_PREFS,
  deliveryDecision,
  fcmMessage,
  formatSeconds,
  friendRequestFromWebhook,
  friendRequestNotification,
  hourInWindow,
  inQuietHours,
  inviteNotification,
  localDay,
  localHour,
  parseBeatLink,
  pushLocale,
  reminderNotification,
  roomJoinedFromBody,
  roomJoinedNotification,
  roomNudgeFromWebhook,
  roomNudgeNotification,
  tokenUnregistered,
  type PushPrefs,
} from "./pushRules";

const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);

// 2026-10-31T06:30Z: 23:30 the night before in Los Angeles, 07:30 in London, 15:30 in Tokyo.
const NOW = new Date("2026-10-31T06:30:00Z");
const prefs = (over: Partial<PushPrefs> = {}): PushPrefs => ({ ...DEFAULT_PUSH_PREFS, timezone: "Europe/London", ...over });

describe("the Deno mirror", () => {
  it("is byte-for-byte the src module's MIRROR block", () => {
    const block = (text: string) => text.slice(text.indexOf("// --- MIRROR START ---"), text.indexOf("// --- MIRROR END ---"));
    const src = readFileSync(here("./pushRules.ts"), "utf8");
    const deno = readFileSync(here("../../supabase/functions/_shared/pushRules.ts"), "utf8");
    expect(block(deno).length).toBeGreaterThan(1000);
    expect(block(deno)).toBe(block(src));
  });
});

describe("local time", () => {
  it("gives the hour and day in a zone, wrapping the date, and falls back to UTC for an unknown zone", () => {
    expect(localHour("America/Los_Angeles", NOW)).toBe(23);
    expect(localDay("America/Los_Angeles", NOW)).toBe("2026-10-30");
    expect(localHour("Europe/London", NOW)).toBe(6);
    expect(localHour("Asia/Tokyo", NOW)).toBe(15);
    expect(localHour("Not/AZone", NOW)).toBe(6);
    expect(localDay("Not/AZone", NOW)).toBe("2026-10-31");
  });

  it("hourInWindow wraps midnight and an empty window matches nothing", () => {
    expect(hourInWindow(23, 22, 8)).toBe(true);
    expect(hourInWindow(3, 22, 8)).toBe(true);
    expect(hourInWindow(8, 22, 8)).toBe(false);
    expect(hourInWindow(12, 22, 8)).toBe(false);
    expect(hourInWindow(10, 9, 17)).toBe(true);
    expect(hourInWindow(17, 9, 17)).toBe(false);
    expect(hourInWindow(5, 5, 5)).toBe(false);
  });
});

describe("deliveryDecision", () => {
  it("honours each kind's switch", () => {
    expect(deliveryDecision(prefs({ daily_reminder: false }), "daily_reminder", NOW)).toBe("opted_out");
    expect(deliveryDecision(prefs({ daily_reminder: true }), "daily_reminder", new Date("2026-10-31T12:00:00Z"))).toBe("send");
    expect(deliveryDecision(prefs({ room_invites: false }), "room_invite", new Date("2026-10-31T12:00:00Z"))).toBe("opted_out");
    expect(deliveryDecision(prefs({ room_invites: false }), "beat", new Date("2026-10-31T12:00:00Z"))).toBe("opted_out");
    expect(deliveryDecision(prefs({ friend_requests: false }), "friend_request", new Date("2026-10-31T12:00:00Z"))).toBe("opted_out");
    // The host's side of a room rides on the same switch as an invite (phase f).
    expect(deliveryDecision(prefs({ room_invites: false }), "room_joined", new Date("2026-10-31T12:00:00Z"))).toBe("opted_out");
    expect(deliveryDecision(prefs({ room_invites: false }), "room_nudge", new Date("2026-10-31T12:00:00Z"))).toBe("opted_out");
    expect(deliveryDecision(prefs({ room_invites: true }), "room_nudge", new Date("2026-10-31T12:00:00Z"))).toBe("send");
  });

  it("holds everything but allowed room invites during quiet hours, in the player's own zone", () => {
    const la = prefs({ timezone: "America/Los_Angeles", daily_reminder: true }); // 23:30 local: quiet
    expect(inQuietHours(la, NOW)).toBe(true);
    expect(deliveryDecision(la, "daily_reminder", NOW)).toBe("quiet");
    expect(deliveryDecision(la, "friend_request", NOW)).toBe("quiet");
    expect(deliveryDecision(la, "room_invite", NOW)).toBe("send");
    expect(deliveryDecision(la, "beat", NOW)).toBe("send");
    expect(deliveryDecision(la, "room_joined", NOW)).toBe("send");
    expect(deliveryDecision(la, "room_nudge", NOW)).toBe("send");
    expect(deliveryDecision({ ...la, quiet_allow_invites: false }, "room_invite", NOW)).toBe("quiet");
    expect(deliveryDecision({ ...la, quiet_allow_invites: false }, "room_joined", NOW)).toBe("quiet");
    expect(deliveryDecision({ ...la, quiet_hours: false }, "daily_reminder", NOW)).toBe("send");
    const tokyo = prefs({ timezone: "Asia/Tokyo", daily_reminder: true }); // 15:30 local: not quiet
    expect(deliveryDecision(tokyo, "daily_reminder", NOW)).toBe("send");
  });
});

describe("notifications", () => {
  it("builds the reminder with the theme and size, or a plain line, in the device's language", () => {
    const en = reminderNotification({ day: "2026-10-31", theme: "Shapes and shadows", width: 5, height: 5 }, "en");
    expect(en).toMatchObject({ kind: "daily_reminder", title: "Today's mini is ready", body: "Shapes and shadows · 5×5", url: "https://crosswordclash.com/menu", collapseId: "daily-2026-10-31" });
    expect(reminderNotification({ day: "2026-10-31" }, "en").body).toBe("A fresh crossword is waiting.");
    expect(reminderNotification({ day: "2026-10-31", width: 5, height: 5 }, "es")).toMatchObject({ title: "El mini de hoy está listo", body: "5×5" });
    expect(pushLocale("es-MX")).toBe("es");
    expect(pushLocale("en-GB")).toBe("en");
    expect(pushLocale(null)).toBe("en");
  });

  it("builds a room invite that opens the join link, collapsing per sender (a newer invite replaces the friend's older one), good for an hour", () => {
    const note = inviteNotification({ name: "alicia", title: "Birds of a feather", width: 15, height: 15, code: "KQ7MXB", gameId: "g1" }, "en");
    expect(note).toEqual({
      kind: "room_invite",
      title: "@alicia opened a room",
      body: "Birds of a feather · 15×15 · Join",
      url: "https://crosswordclash.com/?join=KQ7MXB",
      collapseId: "invite-alicia",
      ttlSeconds: 3600,
    });
    expect(inviteNotification({ name: "alicia", title: "T", width: 5, height: 5, code: "KQ7MXB", gameId: "g1" }, "es").body).toBe("T · 5×5 · Unirse");
  });

  it("builds a beat challenge from the daily link and refuses any other link", () => {
    expect(parseBeatLink("/daily/2026-10-20/mini?beat=102&by=Archer")).toEqual({ day: "2026-10-20", slot: "mini", seconds: 102 });
    expect(parseBeatLink("/daily/2026-10-20/large")).toEqual({ day: "2026-10-20", slot: "large", seconds: null });
    expect(parseBeatLink("https://evil.example/daily/2026-10-20/mini")).toBeNull();
    const note = beatNotification({ name: "milo", link: "/daily/2026-10-20/mini?beat=102", inviteId: "i1" }, "en")!;
    expect(note.title).toBe("@milo solved today's mini in 1:42");
    expect(note.url).toBe("https://crosswordclash.com/daily/2026-10-20/mini?beat=102");
    expect(beatNotification({ name: "milo", link: "/daily/2026-10-20/large", inviteId: "i1" }, "es")!.title).toBe("@milo resolvió el grande de hoy");
    expect(beatNotification({ name: "milo", link: "/nope", inviteId: "i1" }, "en")).toBeNull();
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(3661)).toBe("61:01");
  });

  it("builds a friend request pointing at the friends list", () => {
    expect(friendRequestNotification({ name: "dana" }, "en")).toMatchObject({ title: "@dana wants to be friends", url: "https://crosswordclash.com/race/friends" });
  });

  it("tells the host who joined by username, 'A player' for an anonymous joiner, collapsing with the room's invite (phase f)", () => {
    const note = roomJoinedNotification({ name: "alicia", title: "Birds of a feather", code: "KQ7MXB", gameId: "g1" }, "en");
    expect(note).toEqual({
      kind: "room_joined",
      title: "@alicia joined your room",
      body: "Birds of a feather · Go to room",
      url: "https://crosswordclash.com/?join=KQ7MXB",
      collapseId: "room-g1",
      ttlSeconds: 3600,
    });
    expect(roomJoinedNotification({ name: null, title: "", code: "KQ7MXB", gameId: "g1" }, "en")).toMatchObject({ title: "A player joined your room", body: "Go to room" });
    expect(roomJoinedNotification({ name: "alicia", title: "Aves", code: "KQ7MXB", gameId: "g1" }, "es")).toMatchObject({ title: "@alicia entró en tu sala", body: "Aves · Ir a la sala" });
  });

  it("builds the nudge the same way: 'is waiting in your room', the join link, the room's collapse id", () => {
    const note = roomNudgeNotification({ name: "alicia", title: "Birds of a feather", code: "KQ7MXB", gameId: "g1" }, "en");
    expect(note).toEqual({
      kind: "room_nudge",
      title: "@alicia is waiting in your room",
      body: "Birds of a feather · Go to room",
      url: "https://crosswordclash.com/?join=KQ7MXB",
      collapseId: "room-g1",
      ttlSeconds: 3600,
    });
    expect(roomNudgeNotification({ name: null, title: " ", code: "K", gameId: "g1" }, "es")).toMatchObject({ title: "Alguien te espera en tu sala", body: "Ir a la sala" });
  });
});

describe("the room-side bodies", () => {
  it("reads the players trigger's own body and nothing else", () => {
    expect(roomJoinedFromBody({ kind: "room_joined", gameId: "g1", joinerUserId: "u2" })).toEqual({ gameId: "g1", joinerUserId: "u2" });
    expect(roomJoinedFromBody({ kind: "room_joined", gameId: "g1" })).toBeNull();
    expect(roomJoinedFromBody({ kind: "room_joined", gameId: 7, joinerUserId: "u2" })).toBeNull();
    expect(roomJoinedFromBody({ kind: "daily_reminder" })).toBeNull();
  });

  it("reads a room_nudges INSERT webhook and refuses an update, another table or a malformed row", () => {
    const record = { id: "n1", game_id: "g1", from_user_id: "u2", to_user_id: "u1" };
    expect(roomNudgeFromWebhook({ type: "INSERT", table: "room_nudges", record })).toEqual({ gameId: "g1", fromUserId: "u2", toUserId: "u1" });
    expect(roomNudgeFromWebhook({ type: "UPDATE", table: "room_nudges", record })).toBeNull();
    expect(roomNudgeFromWebhook({ type: "INSERT", table: "room_invites", record })).toBeNull();
    expect(roomNudgeFromWebhook({ type: "INSERT", table: "room_nudges", record: { game_id: "g1" } })).toBeNull();
    expect(roomNudgeFromWebhook({ type: "INSERT", table: "room_nudges", record: null })).toBeNull();
  });
});

describe("friendRequestFromWebhook", () => {
  const record = { requester_id: "r", recipient_id: "t", status: "pending", created_at: "2026-11-02T00:00:00Z" };
  it("names the recipient of a fresh pending request", () => {
    expect(friendRequestFromWebhook({ type: "INSERT", table: "friendships", record })).toEqual({ requesterId: "r", recipientId: "t" });
  });
  it("ignores an accept (an update, or a row born accepted), other tables, other events and a malformed row", () => {
    expect(friendRequestFromWebhook({ type: "UPDATE", table: "friendships", record })).toBeNull();
    expect(friendRequestFromWebhook({ type: "INSERT", table: "friendships", record: { ...record, status: "accepted" } })).toBeNull();
    expect(friendRequestFromWebhook({ type: "INSERT", table: "room_invites", record })).toBeNull();
    expect(friendRequestFromWebhook({ type: "INSERT", table: "friendships", record: { status: "pending" } })).toBeNull();
    expect(friendRequestFromWebhook({ type: "INSERT", table: "friendships", record: null })).toBeNull();
    expect(friendRequestFromWebhook({ kind: "daily_reminder" } as never)).toBeNull();
  });
});

describe("the store requests", () => {
  const note = inviteNotification({ name: "alicia", title: "T", width: 5, height: 5, code: "KQ7MXB", gameId: "g1" }, "en");

  it("APNs: the topic, alert type, collapse id, expiry and a payload with the url", () => {
    const req = apnsRequest(note, "com.crosswordclash.app", NOW);
    expect(req.headers).toEqual({
      "apns-topic": "com.crosswordclash.app",
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-collapse-id": "invite-alicia",
      "apns-expiration": String(Math.floor(NOW.getTime() / 1000) + 3600),
    });
    expect(req.body).toEqual({ aps: { alert: { title: note.title, body: note.body }, sound: "default" }, url: note.url, kind: "room_invite" });
  });

  it("FCM: the token, notification, data url, collapse key, ttl and channel", () => {
    expect(fcmMessage(note, "tok")).toEqual({
      message: {
        token: "tok",
        notification: { title: note.title, body: note.body },
        data: { url: note.url, kind: "room_invite" },
        android: { collapse_key: "invite-alicia", ttl: "3600s", priority: "high", notification: { channel_id: "crossword-clash" } },
      },
    });
  });

  it("APNs provider token: ES256 with the key id, the team as issuer, an iat in seconds, refreshed after 50 minutes", () => {
    expect(apnsTokenClaims("TEAM123456", "KEY1234567", NOW)).toEqual({ header: { alg: "ES256", kid: "KEY1234567" }, payload: { iss: "TEAM123456", iat: Math.floor(NOW.getTime() / 1000) } });
    expect(apnsTokenStale(NOW.getTime() - 49 * 60 * 1000, NOW)).toBe(false);
    expect(apnsTokenStale(NOW.getTime() - 51 * 60 * 1000, NOW)).toBe(true);
  });

  it("carries a room-side kind through both stores with the room's collapse id", () => {
    const joined = roomJoinedNotification({ name: "alicia", title: "T", code: "KQ7MXB", gameId: "g1" }, "en");
    const req = apnsRequest(joined, "com.crosswordclash.app", NOW);
    expect(req.headers["apns-collapse-id"]).toBe("room-g1");
    expect(req.body).toMatchObject({ aps: { alert: { title: "@alicia joined your room" } }, url: "https://crosswordclash.com/?join=KQ7MXB", kind: "room_joined" });
    expect(fcmMessage(joined, "tok")).toMatchObject({ message: { data: { kind: "room_joined", url: joined.url }, android: { collapse_key: "room-g1", ttl: "3600s" } } });
  });

  it("knows which store answers mean the token is gone", () => {
    expect(tokenUnregistered("ios", 410, "Unregistered")).toBe(true);
    expect(tokenUnregistered("ios", 400, "BadDeviceToken")).toBe(true);
    expect(tokenUnregistered("ios", 500, "InternalServerError")).toBe(false);
    expect(tokenUnregistered("android", 404, "UNREGISTERED")).toBe(true);
    expect(tokenUnregistered("android", 503, "UNAVAILABLE")).toBe(false);
  });
});
