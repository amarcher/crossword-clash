import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sameToken } from "../_shared/purchaseEvents.ts";
import { purchaseAlertText, type PurchaseEventRow } from "../_shared/purchaseAlert.ts";

/**
 * One Slack line per purchase lifecycle event, in #crossword-clash. Called by
 * the pg_net trigger `purchase_alert` on INSERT into purchase_events
 * (installed by hand from docs/purchase-alert-setup.sql, since the shared
 * secret cannot sit in a migration; docs/plus-setup.md §4), with the HTTP
 * header `x-purchase-alert-secret: <PURCHASE_ALERT_SECRET>`. Deploy with
 * `--no-verify-jwt` (the trigger carries no user JWT), like report-alert.
 *
 * Secrets: PURCHASE_ALERT_SECRET (shared with the trigger's header),
 * SLACK_BOT_TOKEN (the "Crossword Clash Alerts" app's bot token, scope
 * chat:write; the bot is a member of the channel) and SLACK_PURCHASE_CHANNEL
 * (the channel id, `C…`, or `#crossword-clash` with chat:write.public).
 *
 * The line names a store, a plan and a date, never a user beyond the first
 * eight characters of the uid (`src/lib/purchaseAlert.ts`). The trailing
 * "N active" counts Plus rows in force; the trigger fires on the event row,
 * which verify-purchase writes *before* the entitlement, so the count waits
 * SETTLE_MS for that second write to land.
 */
const SECRET = Deno.env.get("PURCHASE_ALERT_SECRET") ?? "";
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") ?? "";
const CHANNEL = Deno.env.get("SLACK_PURCHASE_CHANNEL") ?? "";
const SETTLE_MS = 2000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Plus rows that grant access right now: active or in grace, and not past their expiry (null = lifetime). */
async function activePlusCount(): Promise<number | null> {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { count, error } = await db
    .from("entitlements")
    .select("*", { count: "exact", head: true })
    .eq("product", "plus")
    .in("status", ["active", "grace"])
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if (error) {
    console.error("purchase-alert: entitlements count failed", error.message);
    return null;
  }
  return count;
}

async function postToSlack(text: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: CHANNEL, text, unfurl_links: false, unfurl_media: false }),
  });
  if (!res.ok) return { ok: false, error: `http_${res.status}` };
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return body.ok ? { ok: true } : { ok: false, error: body.error ?? "unknown" };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SECRET || !sameToken(req.headers.get("x-purchase-alert-secret") ?? "", SECRET)) return json({ error: "unauthorized" }, 401);
  if (!SLACK_BOT_TOKEN || !CHANNEL) return json({ error: "not_configured" }, 500);

  let record: PurchaseEventRow | null = null;
  try {
    const body = (await req.json()) as { type?: string; table?: string; record?: PurchaseEventRow };
    if (body.type === "INSERT" && body.table === "purchase_events" && body.record?.source && body.record?.kind) record = body.record;
  } catch {
    record = null;
  }
  if (!record) return json({ error: "invalid_request" }, 400);

  // Nothing to say (TEST, checkout.session.completed, a quiet update): answer
  // before any waiting, so the trigger's request returns at once.
  if (purchaseAlertText(record) === null) return json({ ok: true, skipped: true });

  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  const text = purchaseAlertText(record, { activeCount: await activePlusCount() });
  if (text === null) return json({ ok: true, skipped: true });

  const sent = await postToSlack(text);
  if (!sent.ok) return json({ error: "send_failed", slack: sent.error }, 502);
  return json({ ok: true });
});
