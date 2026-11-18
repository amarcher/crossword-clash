/**
 * Push notification rules: Deno MIRROR of src/lib/pushRules.ts.
 *
 * Edge functions run under Deno and are not covered by `tsc -b` or vitest, so
 * the authoritative, tested copy lives in src/lib/pushRules.ts. Everything
 * between the MIRROR markers must stay byte-for-byte identical to that file's
 * block; src/lib/pushRules.test.ts fails when it is not. Edit the src copy,
 * then paste the block here.
 */

// --- MIRROR START ---

export type PushKind = "daily_reminder" | "room_invite" | "beat" | "friend_request" | "room_joined" | "room_nudge" | "race_reply";

/** The kinds that ride on the `room_invites` switch: an invite, a beat challenge, and the host's side of a room (a join, a nudge). */
export const ROOM_KINDS: readonly PushKind[] = ["room_invite", "beat", "room_joined", "room_nudge"];
export type PushLocale = "en" | "es";

/** The `notification_preferences` row as the sender reads it. */
export interface PushPrefs {
  daily_reminder: boolean;
  daily_reminder_hour: number;
  room_invites: boolean;
  friend_requests: boolean;
  quiet_hours: boolean;
  quiet_start: number;
  quiet_end: number;
  quiet_allow_invites: boolean;
  timezone: string;
}

export const DEFAULT_PUSH_PREFS: PushPrefs = {
  daily_reminder: false,
  daily_reminder_hour: 8,
  room_invites: true,
  friend_requests: true,
  quiet_hours: true,
  quiet_start: 22,
  quiet_end: 8,
  quiet_allow_invites: true,
  timezone: "UTC",
};

/** The hour (0–23) in an IANA time zone; UTC when the zone is unknown. */
export function localHour(timezone: string, now: Date = new Date()): number {
  try {
    const text = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(now);
    const hour = Number.parseInt(text, 10);
    return Number.isFinite(hour) ? hour % 24 : now.getUTCHours();
  } catch {
    return now.getUTCHours();
  }
}

/** The calendar day (YYYY-MM-DD) in an IANA time zone; the UTC day when the zone is unknown. */
export function localDay(timezone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).format(now);
    return /^\d{4}-\d{2}-\d{2}$/.test(parts) ? parts : now.toISOString().slice(0, 10);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Whether `hour` falls in a window that may wrap midnight (22 → 8 covers 22, 23, 0 … 7). */
export function hourInWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function inQuietHours(prefs: PushPrefs, now: Date = new Date()): boolean {
  return prefs.quiet_hours && hourInWindow(localHour(prefs.timezone, now), prefs.quiet_start, prefs.quiet_end);
}

export type Delivery = "send" | "opted_out" | "quiet";

/** The per-kind switch, then quiet hours (room invites cross them when the player allows it). */
export function deliveryDecision(prefs: PushPrefs, kind: PushKind, now: Date = new Date()): Delivery {
  if (kind === "daily_reminder" && !prefs.daily_reminder) return "opted_out";
  if (ROOM_KINDS.includes(kind) && !prefs.room_invites) return "opted_out";
  if (kind === "friend_request" && !prefs.friend_requests) return "opted_out";
  // A race reply rides on the room switch but, not being urgent, keeps to quiet hours.
  if (kind === "race_reply" && !prefs.room_invites) return "opted_out";
  if (!inQuietHours(prefs, now)) return "send";
  if (ROOM_KINDS.includes(kind) && prefs.quiet_allow_invites) return "send";
  return "quiet";
}

/** What one notification carries; the sender maps it onto APNs and FCM. */
export interface Notification {
  kind: PushKind;
  title: string;
  body: string;
  /** An https link on the site; the app hands it to `appLinkTarget`, so a tap and an app link are the same path. */
  url: string;
  /** Replaces an earlier notification of the same id instead of stacking (`apns-collapse-id` / FCM `collapse_key`). */
  collapseId: string;
  /** How long the store may hold it for an offline device, in seconds. */
  ttlSeconds: number;
}

export const SITE = "https://crosswordclash.com";
/** A lobby is dead to the invitee after an hour (docs/friends-spec.md §3.4). */
export const INVITE_TTL_SECONDS = 60 * 60;
/** A reminder for a day is pointless the next day. */
export const REMINDER_TTL_SECONDS = 12 * 60 * 60;

const STRINGS: Record<PushLocale, Record<string, string>> = {
  en: {
    reminderTitle: "Today's mini is ready",
    reminderBody: "{{theme}}{{size}}",
    reminderBodyPlain: "A fresh crossword is waiting.",
    inviteTitle: "@{{name}} opened a room",
    inviteBody: "{{title}} · {{size}} · Join",
    beatTitle: "@{{name}} solved today's {{slot}} in {{time}}",
    beatTitleDay: "@{{name}} solved the {{date}} {{slot}} in {{time}}",
    beatTitlePuzzle: "@{{name}} solved “{{title}}” in {{time}}",
    beatTitlePuzzlePlain: "@{{name}} solved a community puzzle in {{time}}",
    beatBody: "Beat it",
    beatBodyRace: "Race their solve",
    requestTitle: "@{{name}} wants to be friends",
    requestBody: "Accept or decline on your Race friends screen",
    joinedTitle: "@{{name}} joined your room",
    joinedTitleAnon: "A player joined your room",
    joinedBody: "{{title}} · Go to room",
    joinedBodyPlain: "Go to room",
    nudgeTitle: "@{{name}} is waiting in your room",
    nudgeTitleAnon: "A player is waiting in your room",
    nudgeBody: "{{title}} · Go to room",
    nudgeBodyPlain: "Go to room",
    replyTitle: "{{name}} raced your {{slot}}",
    replyTitlePuzzle: "{{name}} raced your “{{title}}”",
    replyTitlePuzzlePlain: "{{name}} raced your community puzzle",
    replyWon: "{{name}} won by {{delta}} · Watch",
    replyLost: "You won by {{delta}} · Watch",
    replyTied: "Dead heat · Watch",
    mini: "mini",
    midi: "midi",
    large: "large",
  },
  es: {
    reminderTitle: "El mini de hoy está listo",
    reminderBody: "{{theme}}{{size}}",
    reminderBodyPlain: "Te espera un crucigrama nuevo.",
    inviteTitle: "@{{name}} abrió una sala",
    inviteBody: "{{title}} · {{size}} · Unirse",
    beatTitle: "@{{name}} resolvió el {{slot}} de hoy en {{time}}",
    beatTitleDay: "@{{name}} resolvió el {{slot}} del {{date}} en {{time}}",
    beatTitlePuzzle: "@{{name}} resolvió «{{title}}» en {{time}}",
    beatTitlePuzzlePlain: "@{{name}} resolvió un crucigrama de la comunidad en {{time}}",
    beatBody: "Supéralo",
    beatBodyRace: "Compite contra su solución",
    requestTitle: "@{{name}} quiere ser tu amigo",
    requestBody: "Acepta o rechaza en tu pantalla Compite con amigos",
    joinedTitle: "@{{name}} entró en tu sala",
    joinedTitleAnon: "Alguien entró en tu sala",
    joinedBody: "{{title}} · Ir a la sala",
    joinedBodyPlain: "Ir a la sala",
    nudgeTitle: "@{{name}} te espera en tu sala",
    nudgeTitleAnon: "Alguien te espera en tu sala",
    nudgeBody: "{{title}} · Ir a la sala",
    nudgeBodyPlain: "Ir a la sala",
    replyTitle: "{{name}} compitió contra tu {{slot}}",
    replyTitlePuzzle: "{{name}} compitió contra tu «{{title}}»",
    replyTitlePuzzlePlain: "{{name}} compitió contra tu crucigrama de la comunidad",
    replyWon: "{{name}} ganó por {{delta}} · Ver",
    replyLost: "Ganaste por {{delta}} · Ver",
    replyTied: "Empate · Ver",
    mini: "mini",
    midi: "midi",
    large: "grande",
  },
};

function fill(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => params[key] ?? "");
}

export function pushLocale(locale: string | null | undefined): PushLocale {
  return (locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

/** m:ss, the way the app formats a solve time. */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function reminderNotification(input: { day: string; theme?: string | null; width?: number; height?: number }, locale: PushLocale): Notification {
  const t = STRINGS[locale];
  const size = input.width && input.height ? `${input.width}×${input.height}` : "";
  const theme = (input.theme ?? "").trim();
  const body = theme || size ? fill(t.reminderBody, { theme, size: theme && size ? ` · ${size}` : size }) : t.reminderBodyPlain;
  return { kind: "daily_reminder", title: t.reminderTitle, body, url: `${SITE}/menu`, collapseId: `daily-${input.day}`, ttlSeconds: REMINDER_TTL_SECONDS };
}

export function inviteNotification(input: { name: string; title: string; width: number; height: number; code: string; gameId: string }, locale: PushLocale): Notification {
  const t = STRINGS[locale];
  return {
    kind: "room_invite",
    title: fill(t.inviteTitle, { name: input.name }),
    body: fill(t.inviteBody, { title: input.title, size: `${input.width}×${input.height}` }),
    url: `${SITE}/?join=${encodeURIComponent(input.code)}`,
    // Per sender, not per room: the invite's recipient is never the one the
    // room's own pushes (a join, a nudge) go to, and a second invite from the
    // same friend must replace the first in Notification Center, or the older
    // one, pointing at a finished room, is the one that gets tapped.
    collapseId: `invite-${input.name}`,
    ttlSeconds: INVITE_TTL_SECONDS,
  };
}

export type BeatLink = { seconds: number | null; race: boolean } & ({ day: string; slot: "mini" | "midi" | "large" } | { shortId: string });

/**
 * The challenge link an invite carries: a day's daily
 * (`/daily/:day/:slot?beat=<seconds>&by=<name>&r=<replay>`) or a community
 * puzzle (`/puzzles/:shortId?…`). `race` when it carries the sender's replay.
 */
export function parseBeatLink(link: string): BeatLink | null {
  const daily = /^\/daily\/(\d{4}-\d{2}-\d{2})\/(mini|midi|large)(?:\?(.*))?$/.exec(link);
  const community = daily ? null : /^\/puzzles\/([a-z0-9]{8})(?:\?(.*))?$/.exec(link);
  if (!daily && !community) return null;
  const params = new URLSearchParams((daily ? daily[3] : community![2]) ?? "");
  const raw = params.get("beat");
  const seconds = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  const race = /^[A-Za-z0-9_-]{11}$/.test(params.get("r") ?? "");
  return daily ? { day: daily[1], slot: daily[2] as "mini" | "midi" | "large", seconds, race } : { shortId: community![1], seconds, race };
}

/** "Nov 3", for a past daily's invite. */
function shortDay(day: string, locale: PushLocale): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale === "es" ? "es" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * "@milo solved today's mini in 1:42 · Race their solve": a friend's invite to
 * race (or beat) their finish. A daily more than a day from now (UTC, so any
 * time zone's today reads as today) is named by date; a community puzzle by
 * its title, which the caller looks up (null when it couldn't).
 */
export function beatNotification(input: { name: string; link: string; inviteId: string; title?: string | null }, locale: PushLocale, now: Date = new Date()): Notification | null {
  const parsed = parseBeatLink(input.link);
  if (!parsed) return null;
  const t = STRINGS[locale];
  const time = parsed.seconds === null ? "" : formatSeconds(parsed.seconds);
  let title: string;
  if ("shortId" in parsed) {
    const name = (input.title ?? "").trim();
    title = name ? fill(t.beatTitlePuzzle, { name: input.name, title: name, time }) : fill(t.beatTitlePuzzlePlain, { name: input.name, time });
  } else {
    const recent = Math.abs(Date.parse(`${parsed.day}T12:00:00Z`) - now.getTime()) <= 36 * 60 * 60 * 1000;
    title = recent ? fill(t.beatTitle, { name: input.name, slot: t[parsed.slot], time }) : fill(t.beatTitleDay, { name: input.name, slot: t[parsed.slot], date: shortDay(parsed.day, locale), time });
  }
  return {
    kind: "beat",
    title: title.replace(/ in $/, "").replace(/ en $/, ""),
    body: parsed.race ? t.beatBodyRace : t.beatBody,
    url: `${SITE}${input.link}`,
    collapseId: `beat-${input.inviteId}`,
    ttlSeconds: REMINDER_TTL_SECONDS,
  };
}

export function friendRequestNotification(input: { name: string }, locale: PushLocale): Notification {
  const t = STRINGS[locale];
  return {
    kind: "friend_request",
    title: fill(t.requestTitle, { name: input.name }),
    body: t.requestBody,
    url: `${SITE}/race/friends`,
    collapseId: `request-${input.name}`,
    ttlSeconds: REMINDER_TTL_SECONDS,
  };
}

/** What the host's side of a room needs: the joiner's or nudger's username (null for an anonymous player), the room. */
export interface RoomSideInput {
  /** The `profiles.username`, never the typed `players.display_name` (unfiltered on the server); null → "A player". */
  name: string | null;
  title: string;
  code: string;
  gameId: string;
}

/** "@alicia joined your room": to the host on the first join, collapsing with the room's invite (phase f). */
export function roomJoinedNotification(input: RoomSideInput, locale: PushLocale): Notification {
  const t = STRINGS[locale];
  const title = input.title.trim();
  return {
    kind: "room_joined",
    title: input.name ? fill(t.joinedTitle, { name: input.name }) : t.joinedTitleAnon,
    body: title ? fill(t.joinedBody, { title }) : t.joinedBodyPlain,
    url: `${SITE}/?join=${encodeURIComponent(input.code)}`,
    collapseId: `room-${input.gameId}`,
    ttlSeconds: INVITE_TTL_SECONDS,
  };
}

/** "@alicia is waiting in your room": a joiner's nudge to an away host (phase f). */
export function roomNudgeNotification(input: RoomSideInput, locale: PushLocale): Notification {
  const t = STRINGS[locale];
  const title = input.title.trim();
  return {
    kind: "room_nudge",
    title: input.name ? fill(t.nudgeTitle, { name: input.name }) : t.nudgeTitleAnon,
    body: title ? fill(t.nudgeBody, { title }) : t.nudgeBodyPlain,
    url: `${SITE}/?join=${encodeURIComponent(input.code)}`,
    collapseId: `room-${input.gameId}`,
    ttlSeconds: INVITE_TTL_SECONDS,
  };
}

/**
 * "Sam raced your mini · Sam won by 0:12 · Watch", to the sender of a shared
 * daily or community puzzle that someone raced (migrations
 * 20261113100000_race_replies.sql, 20261114000000_races_anywhere.sql); a tap
 * opens the reply's page, which plays their solve.
 */
export function raceReplyNotification(input: { id: string; name: string; slot: "mini" | "midi" | "large" | null; title?: string | null; seconds: number; toSeconds: number }, locale: PushLocale): Notification {
  const t = STRINGS[locale];
  const delta = formatSeconds(Math.abs(input.seconds - input.toSeconds));
  const body = input.seconds < input.toSeconds ? fill(t.replyWon, { name: input.name, delta }) : input.seconds > input.toSeconds ? fill(t.replyLost, { delta }) : t.replyTied;
  return {
    kind: "race_reply",
    title: input.slot
      ? fill(t.replyTitle, { name: input.name, slot: t[input.slot] })
      : input.title?.trim()
        ? fill(t.replyTitlePuzzle, { name: input.name, title: input.title.trim() })
        : fill(t.replyTitlePuzzlePlain, { name: input.name }),
    body,
    url: `${SITE}/reply/${input.id}`,
    collapseId: `reply-${input.id}`,
    ttlSeconds: REMINDER_TTL_SECONDS,
  };
}

/** The APNs request: headers and the JSON body for a token. */
export function apnsRequest(note: Notification, bundleId: string, now: Date = new Date()): { headers: Record<string, string>; body: unknown } {
  return {
    headers: {
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-collapse-id": note.collapseId.slice(0, 64),
      "apns-expiration": String(Math.floor(now.getTime() / 1000) + note.ttlSeconds),
    },
    body: { aps: { alert: { title: note.title, body: note.body }, sound: "default" }, url: note.url, kind: note.kind },
  };
}

/** The FCM HTTP v1 message for a token. */
export function fcmMessage(note: Notification, token: string): unknown {
  return {
    message: {
      token,
      notification: { title: note.title, body: note.body },
      data: { url: note.url, kind: note.kind },
      android: { collapse_key: note.collapseId.slice(0, 64), ttl: `${note.ttlSeconds}s`, priority: "high", notification: { channel_id: "crossword-clash" } },
    },
  };
}

/** The claims of an APNs provider token (ES256; `iat` must be under an hour old, refreshed between 20 and 60 minutes). */
export function apnsTokenClaims(teamId: string, keyId: string, now: Date = new Date()): { header: { alg: "ES256"; kid: string }; payload: { iss: string; iat: number } } {
  return { header: { alg: "ES256", kid: keyId }, payload: { iss: teamId, iat: Math.floor(now.getTime() / 1000) } };
}

/** Refresh the cached provider token after 50 minutes: inside Apple's 20–60 minute window with margin. */
export const APNS_TOKEN_REFRESH_MS = 50 * 60 * 1000;
export function apnsTokenStale(issuedAtMs: number, now: Date = new Date()): boolean {
  return now.getTime() - issuedAtMs > APNS_TOKEN_REFRESH_MS;
}

/** Whether a store's answer means the token is gone for good (delete the row) rather than a passing failure. */
export function tokenUnregistered(platform: "ios" | "android", status: number, reason: string | null | undefined): boolean {
  if (platform === "ios") return status === 410 || reason === "BadDeviceToken" || reason === "Unregistered" || reason === "DeviceTokenNotForTopic";
  return status === 404 || reason === "UNREGISTERED" || reason === "NOT_FOUND" || reason === "INVALID_ARGUMENT";
}

/** The `friendships` row a Database Webhook posts on INSERT; only a fresh pending request is a notification (an accept updates the row, never inserts). */
export interface FriendshipRecord {
  requester_id: string;
  recipient_id: string;
  status: string;
}

export function friendRequestFromWebhook(body: { type?: string; table?: string; record?: Partial<FriendshipRecord> | null }): { requesterId: string; recipientId: string } | null {
  if (body.type !== "INSERT" || body.table !== "friendships") return null;
  const r = body.record;
  if (!r || r.status !== "pending" || typeof r.requester_id !== "string" || typeof r.recipient_id !== "string") return null;
  return { requesterId: r.requester_id, recipientId: r.recipient_id };
}

/** The `room_nudges` row a Database Webhook posts on INSERT. */
export interface RoomNudgeRecord {
  id: string;
  game_id: string;
  from_user_id: string;
  to_user_id: string;
}

export function roomNudgeFromWebhook(body: { type?: string; table?: string; record?: Partial<RoomNudgeRecord> | null }): { gameId: string; fromUserId: string; toUserId: string } | null {
  if (body.type !== "INSERT" || body.table !== "room_nudges") return null;
  const r = body.record;
  if (!r || typeof r.game_id !== "string" || typeof r.from_user_id !== "string" || typeof r.to_user_id !== "string") return null;
  return { gameId: r.game_id, fromUserId: r.from_user_id, toUserId: r.to_user_id };
}

/** The players trigger's own body (`docs/push-setup-players.sql`): the SQL already checked the room is waiting and the joiner is not the host. */
/** A race_replies row as the webhook carries it. */
export interface RaceReplyRecord {
  id: string;
  to_user_id: string;
  name: string;
  slot: string | null;
  short_id: string | null;
  title: string | null;
  seconds: number;
  to_seconds: number;
}

/** The webhook body of a race_replies INSERT, when it is one. */
export function raceReplyFromWebhook(body: { type?: string; table?: string; record?: Partial<RaceReplyRecord> | null }): { id: string; toUserId: string; name: string; slot: "mini" | "midi" | "large" | null; title: string | null; seconds: number; toSeconds: number } | null {
  const r = body.record;
  if (body.type !== "INSERT" || body.table !== "race_replies" || !r) return null;
  if (typeof r.id !== "string" || typeof r.to_user_id !== "string" || typeof r.name !== "string") return null;
  const daily = r.slot === "mini" || r.slot === "midi" || r.slot === "large";
  if (!daily && typeof r.short_id !== "string") return null;
  if (typeof r.seconds !== "number" || typeof r.to_seconds !== "number") return null;
  const slot = daily ? (r.slot as "mini" | "midi" | "large") : null;
  return { id: r.id, toUserId: r.to_user_id, name: r.name, slot, title: daily || typeof r.title !== "string" ? null : r.title, seconds: r.seconds, toSeconds: r.to_seconds };
}

export function roomJoinedFromBody(body: { kind?: string; gameId?: unknown; joinerUserId?: unknown }): { gameId: string; joinerUserId: string } | null {
  if (body.kind !== "room_joined" || typeof body.gameId !== "string" || typeof body.joinerUserId !== "string") return null;
  return { gameId: body.gameId, joinerUserId: body.joinerUserId };
}

// --- MIRROR END ---
