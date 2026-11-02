/**
 * Push notifications: the PURE half of the send-push edge function
 * (docs/friends-spec.md §3.3–3.4, §5.3), framework-free so it can be
 * typechecked and unit-tested here.
 *
 * Everything between the MIRROR markers is copied verbatim into
 * supabase/functions/_shared/pushRules.ts, which the Deno runtime imports;
 * `pushRules.test.ts` fails if the two copies differ. Edit this file, then
 * copy the block. Nothing in the block touches `import.meta.env`, storage or
 * the network; the only platform API it needs is `Intl.DateTimeFormat`.
 */

// --- MIRROR START ---

export type PushKind = "daily_reminder" | "room_invite" | "beat" | "friend_request";
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
  if ((kind === "room_invite" || kind === "beat") && !prefs.room_invites) return "opted_out";
  if (kind === "friend_request" && !prefs.friend_requests) return "opted_out";
  if (!inQuietHours(prefs, now)) return "send";
  if ((kind === "room_invite" || kind === "beat") && prefs.quiet_allow_invites) return "send";
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
    beatBody: "Beat it",
    requestTitle: "@{{name}} wants to be friends",
    requestBody: "Accept or decline on your Race friends screen",
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
    beatBody: "Supéralo",
    requestTitle: "@{{name}} quiere ser tu amigo",
    requestBody: "Acepta o rechaza en tu pantalla Compite con amigos",
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
    collapseId: `room-${input.gameId}`,
    ttlSeconds: INVITE_TTL_SECONDS,
  };
}

/** The daily challenge link an invite carries: `/daily/:day/:slot?beat=<seconds>&by=<name>`. */
export function parseBeatLink(link: string): { day: string; slot: "mini" | "midi" | "large"; seconds: number | null } | null {
  const m = /^\/daily\/(\d{4}-\d{2}-\d{2})\/(mini|midi|large)(?:\?(.*))?$/.exec(link);
  if (!m) return null;
  const params = new URLSearchParams(m[3] ?? "");
  const raw = params.get("beat");
  const seconds = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  return { day: m[1], slot: m[2] as "mini" | "midi" | "large", seconds };
}

export function beatNotification(input: { name: string; link: string; inviteId: string }, locale: PushLocale): Notification | null {
  const parsed = parseBeatLink(input.link);
  if (!parsed) return null;
  const t = STRINGS[locale];
  return {
    kind: "beat",
    title: fill(t.beatTitle, { name: input.name, slot: t[parsed.slot], time: parsed.seconds === null ? "" : formatSeconds(parsed.seconds) }).replace(/ in $/, "").replace(/ en $/, ""),
    body: t.beatBody,
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

// --- MIRROR END ---
