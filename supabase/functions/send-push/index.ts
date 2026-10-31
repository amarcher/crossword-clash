import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "https://esm.sh/jose@5.9.6";
import { sameToken } from "../_shared/purchaseEvents.ts";
import {
  apnsRequest,
  apnsTokenStale,
  beatNotification,
  deliveryDecision,
  DEFAULT_PUSH_PREFS,
  fcmMessage,
  inviteNotification,
  pushLocale,
  reminderNotification,
  tokenUnregistered,
  type Notification,
  type PushKind,
  type PushPrefs,
} from "../_shared/pushRules.ts";

/**
 * The one sender of push notifications (docs/friends-spec.md §3.3–3.4).
 * Service role; deployed with `--no-verify-jwt` because its callers carry no
 * user JWT: the hourly pg_cron job (`net.http_post`, docs/push-setup.md) and
 * the Database Webhook on `room_invites` INSERT. Every request must carry
 * `x-push-secret: <PUSH_SENDER_SECRET>`.
 *
 *   POST { kind: "daily_reminder" }                          → everyone whose local hour is their reminder hour
 *   POST { type: "INSERT", table: "room_invites", record }    → the invitee (the webhook's body)
 *   POST { kind: "test", userId }                             → one user's devices, for the runbook's smoke test
 *
 * iOS goes straight to APNs over HTTP/2 with an ES256 provider token signed
 * from the .p8 (refreshed every 50 minutes, inside Apple's 20–60 minute
 * window); Android goes to FCM HTTP v1 with an OAuth2 token minted from the
 * Firebase service account. A store's "this token is gone" answer deletes
 * the row; every other outcome is a push_log row, never the text.
 *
 * Secrets: PUSH_SENDER_SECRET, APNS_KEY_ID, APNS_TEAM_ID, APNS_P8 (the key's
 * PEM text), APNS_BUNDLE_ID (default com.crosswordclash.app), APNS_SANDBOX=1
 * for a development build, FCM_SERVICE_ACCOUNT (the service account JSON),
 * SITE_URL (the daily feed's host, default https://crosswordclash.com).
 */
const SECRET = Deno.env.get("PUSH_SENDER_SECRET") ?? "";
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_P8 = Deno.env.get("APNS_P8") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "com.crosswordclash.app";
const APNS_HOST = Deno.env.get("APNS_SANDBOX") === "1" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
const FCM_SERVICE_ACCOUNT = Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://crosswordclash.com").replace(/\/+$/, "");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface TokenRow {
  user_id: string;
  token: string;
  platform: "ios" | "android";
  locale: string;
}

type Outcome = "sent" | "unregistered" | "failed" | "quiet" | "opted_out" | "no_token";

// --- APNs ------------------------------------------------------------------

let apnsToken: { jwt: string; issuedAt: number } | null = null;

async function apnsProviderToken(): Promise<string> {
  if (apnsToken && !apnsTokenStale(apnsToken.issuedAt)) return apnsToken.jwt;
  const key = await importPKCS8(APNS_P8, "ES256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ iss: APNS_TEAM_ID, iat: now }).setProtectedHeader({ alg: "ES256", kid: APNS_KEY_ID }).sign(key);
  apnsToken = { jwt, issuedAt: Date.now() };
  return jwt;
}

async function sendApns(token: string, note: Notification): Promise<{ outcome: Outcome; reason?: string }> {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_P8) return { outcome: "failed", reason: "apns_not_configured" };
  const req = apnsRequest(note, APNS_BUNDLE_ID);
  const res = await fetch(`${APNS_HOST}/3/device/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { ...req.headers, authorization: `bearer ${await apnsProviderToken()}`, "content-type": "application/json" },
    body: JSON.stringify(req.body),
  });
  if (res.ok) return { outcome: "sent" };
  let reason: string | undefined;
  try {
    reason = ((await res.json()) as { reason?: string }).reason;
  } catch {
    reason = undefined;
  }
  if (reason === "ExpiredProviderToken") apnsToken = null;
  return { outcome: tokenUnregistered("ios", res.status, reason) ? "unregistered" : "failed", reason: reason ?? `http_${res.status}` };
}

// --- FCM -------------------------------------------------------------------

let fcmAccess: { token: string; expiresAt: number } | null = null;

function serviceAccount(): { client_email: string; private_key: string; project_id: string } | null {
  if (!FCM_SERVICE_ACCOUNT) return null;
  try {
    return JSON.parse(FCM_SERVICE_ACCOUNT);
  } catch {
    return null;
  }
}

async function fcmAccessToken(account: { client_email: string; private_key: string }): Promise<string> {
  if (fcmAccess && fcmAccess.expiresAt > Date.now() + 60_000) return fcmAccess.token;
  const key = await importPKCS8(account.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`fcm_oauth_${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  fcmAccess = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

async function sendFcm(token: string, note: Notification): Promise<{ outcome: Outcome; reason?: string }> {
  const account = serviceAccount();
  if (!account) return { outcome: "failed", reason: "fcm_not_configured" };
  let access: string;
  try {
    access = await fcmAccessToken(account);
  } catch (err) {
    return { outcome: "failed", reason: String(err) };
  }
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify(fcmMessage(note, token)),
  });
  if (res.ok) return { outcome: "sent" };
  let reason: string | undefined;
  try {
    const body = (await res.json()) as { error?: { status?: string; details?: { errorCode?: string }[] } };
    reason = body.error?.details?.find((d) => d.errorCode)?.errorCode ?? body.error?.status;
  } catch {
    reason = undefined;
  }
  return { outcome: tokenUnregistered("android", res.status, reason) ? "unregistered" : "failed", reason: reason ?? `http_${res.status}` };
}

// --- Delivery --------------------------------------------------------------

async function prefsFor(db: SupabaseClient, userIds: string[]): Promise<Map<string, PushPrefs>> {
  const map = new Map<string, PushPrefs>();
  if (userIds.length === 0) return map;
  const { data } = await db.from("notification_preferences").select("*").in("user_id", userIds);
  for (const row of data ?? []) map.set(row.user_id, row as PushPrefs);
  return map;
}

async function tokensFor(db: SupabaseClient, userIds: string[]): Promise<TokenRow[]> {
  if (userIds.length === 0) return [];
  const { data } = await db.from("device_tokens").select("user_id, token, platform, locale").in("user_id", userIds).is("failed_at", null);
  return (data ?? []) as TokenRow[];
}

/** Sends one notification to one device and records the outcome. */
async function deliver(db: SupabaseClient, row: TokenRow, note: Notification): Promise<Outcome> {
  const result = row.platform === "ios" ? await sendApns(row.token, note) : await sendFcm(row.token, note);
  if (result.outcome === "unregistered") await db.from("device_tokens").delete().eq("token", row.token);
  else if (result.outcome === "failed") console.warn("send-push:", row.platform, result.reason);
  await db.from("push_log").insert({ user_id: row.user_id, kind: note.kind, collapse_id: note.collapseId, outcome: result.outcome });
  return result.outcome;
}

/** Applies the recipient's switches and quiet hours, then delivers to every device; one log row per device (or one per skip). */
async function notifyUser(db: SupabaseClient, userId: string, kind: PushKind, prefs: PushPrefs | undefined, tokens: TokenRow[], build: (locale: "en" | "es") => Notification | null): Promise<Record<Outcome, number>> {
  const counts: Record<Outcome, number> = { sent: 0, unregistered: 0, failed: 0, quiet: 0, opted_out: 0, no_token: 0 };
  const decision = deliveryDecision(prefs ?? DEFAULT_PUSH_PREFS, kind);
  if (decision !== "send") {
    await db.from("push_log").insert({ user_id: userId, kind, outcome: decision });
    counts[decision] += 1;
    return counts;
  }
  const mine = tokens.filter((t) => t.user_id === userId);
  if (mine.length === 0) {
    await db.from("push_log").insert({ user_id: userId, kind, outcome: "no_token" });
    counts.no_token += 1;
    return counts;
  }
  for (const row of mine) {
    const note = build(pushLocale(row.locale));
    if (!note) continue;
    counts[await deliver(db, row, note)] += 1;
  }
  return counts;
}

// --- The three jobs --------------------------------------------------------

interface FeedFile {
  title?: string;
  theme?: string;
  size?: { rows?: number; cols?: number };
}

async function dailyReminder(db: SupabaseClient) {
  const { data, error } = await db.rpc("push_reminder_targets");
  if (error) return json({ error: "db_error", message: error.message }, 500);
  const targets = (data ?? []) as { user_id: string; token: string; platform: "ios" | "android"; locale: string; timezone: string; local_day: string }[];
  const feeds = new Map<string, FeedFile | null>();
  for (const day of new Set(targets.map((t) => t.local_day))) {
    try {
      const res = await fetch(`${SITE_URL}/daily-puzzles/${day}.json`);
      feeds.set(day, res.ok ? ((await res.json()) as FeedFile) : null);
    } catch {
      feeds.set(day, null);
    }
  }
  const users = [...new Set(targets.map((t) => t.user_id))];
  const prefs = await prefsFor(db, users);
  const totals: Record<Outcome, number> = { sent: 0, unregistered: 0, failed: 0, quiet: 0, opted_out: 0, no_token: 0 };
  for (const userId of users) {
    const day = targets.find((t) => t.user_id === userId)!.local_day;
    const feed = feeds.get(day);
    const tokens = targets.filter((t) => t.user_id === userId).map((t) => ({ user_id: t.user_id, token: t.token, platform: t.platform, locale: t.locale }));
    const counts = await notifyUser(db, userId, "daily_reminder", prefs.get(userId), tokens, (locale) =>
      reminderNotification({ day, theme: feed?.theme ?? null, width: feed?.size?.cols, height: feed?.size?.rows }, locale),
    );
    for (const k of Object.keys(totals) as Outcome[]) totals[k] += counts[k];
  }
  return json({ ok: true, users: users.length, ...totals });
}

interface InviteRecord {
  id: string;
  kind: "room" | "beat";
  game_id: string | null;
  link: string | null;
  from_user_id: string;
  to_user_id: string;
}

async function roomInvite(db: SupabaseClient, record: InviteRecord) {
  const { data: sender } = await db.from("profiles").select("username").eq("user_id", record.from_user_id).maybeSingle();
  if (!sender) return json({ error: "not_found" }, 404);
  let build: (locale: "en" | "es") => Notification | null;
  if (record.kind === "room") {
    const { data: game } = await db.from("games").select("short_code, status, puzzle:puzzles(title, width, height)").eq("id", record.game_id!).maybeSingle();
    const puzzle = (game as { puzzle?: { title: string; width: number; height: number } | null } | null)?.puzzle ?? null;
    if (!game || game.status !== "waiting" || !game.short_code) return json({ ok: true, skipped: "room_not_open" });
    const code = game.short_code;
    build = (locale) => inviteNotification({ name: sender.username, title: puzzle?.title ?? "", width: puzzle?.width ?? 0, height: puzzle?.height ?? 0, code, gameId: record.game_id! }, locale);
  } else {
    build = (locale) => beatNotification({ name: sender.username, link: record.link ?? "", inviteId: record.id }, locale);
  }
  const prefs = await prefsFor(db, [record.to_user_id]);
  const tokens = await tokensFor(db, [record.to_user_id]);
  const counts = await notifyUser(db, record.to_user_id, record.kind === "room" ? "room_invite" : "beat", prefs.get(record.to_user_id), tokens, build);
  if (counts.sent > 0) await db.from("room_invites").update({ pushed_at: new Date().toISOString() }).eq("id", record.id);
  return json({ ok: true, ...counts });
}

async function smokeTest(db: SupabaseClient, userId: string) {
  const tokens = await tokensFor(db, [userId]);
  const note: Notification = { kind: "daily_reminder", title: "Crossword Clash", body: "Push is set up.", url: `${SITE_URL}/menu`, collapseId: "test", ttlSeconds: 600 };
  const counts: Record<Outcome, number> = { sent: 0, unregistered: 0, failed: 0, quiet: 0, opted_out: 0, no_token: 0 };
  if (tokens.length === 0) counts.no_token += 1;
  for (const row of tokens) counts[await deliver(db, row, note)] += 1;
  return json({ ok: true, ...counts });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SECRET || !sameToken(req.headers.get("x-push-secret") ?? "", SECRET)) return json({ error: "unauthorized" }, 401);

  let body: { kind?: string; userId?: string; type?: string; table?: string; record?: InviteRecord };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (body.kind === "daily_reminder") return dailyReminder(db);
  if (body.type === "INSERT" && body.table === "room_invites" && body.record?.to_user_id) return roomInvite(db, body.record);
  if (body.kind === "test" && body.userId) return smokeTest(db, body.userId);
  return json({ error: "invalid_request" }, 400);
});
