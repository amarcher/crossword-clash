import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sameToken } from "../_shared/purchaseEvents.ts";

/**
 * One email per report (docs/community-puzzles-spec.md decision 8), so the
 * admin can keep the terms' 24 hours. Called by a Supabase Database Webhook on
 * INSERT into puzzle_reports (Dashboard → Database → Webhooks: table
 * puzzle_reports, event Insert, type "Supabase Edge Function", with the HTTP
 * header `x-report-alert-secret: <REPORT_ALERT_SECRET>`). Deploy with
 * `--no-verify-jwt` (the webhook carries no user JWT).
 *
 * Secrets: REPORT_ALERT_SECRET (shared with the webhook header),
 * RESEND_API_KEY, REPORT_ALERT_TO (the inbox), REPORT_ALERT_FROM (a sender on
 * a domain verified in Resend, e.g. "Crossword Clash <reports@crosswordclash.com>").
 * SITE_URL names the site in the links (default https://crosswordclash.com).
 *
 * The reporter is never named in the email.
 */
const SECRET = Deno.env.get("REPORT_ALERT_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const TO = Deno.env.get("REPORT_ALERT_TO") ?? "";
const FROM = Deno.env.get("REPORT_ALERT_FROM") ?? "";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://crosswordclash.com").replace(/\/+$/, "");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface ReportRecord {
  id: string;
  puzzle_id: string;
  reason: string;
  details: string;
  created_at: string;
}

/** The email's subject and body for a report on a puzzle. Pure, so it can be read in one place. */
export function reportEmail(report: ReportRecord, puzzle: { title: string; short_id: string; author: string; status: string; open: number }) {
  const link = `${SITE_URL}/puzzles/${puzzle.short_id}`;
  const subject = `[Crossword Clash] Report: ${puzzle.title} (${report.reason})${puzzle.status === "held" ? " — now held" : ""}`;
  const text = [
    `A player reported "${puzzle.title}" by @${puzzle.author}.`,
    ``,
    `Reason: ${report.reason}`,
    report.details ? `Note: ${report.details}` : `Note: (none)`,
    `Open reports on this puzzle: ${puzzle.open}`,
    `Puzzle status: ${puzzle.status}`,
    ``,
    `Puzzle: ${link}`,
    `Queue: ${SITE_URL}/studio`,
    ``,
    `The terms promise action within 24 hours.`,
  ].join("\n");
  return { subject, text };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SECRET || !sameToken(req.headers.get("x-report-alert-secret") ?? "", SECRET)) return json({ error: "unauthorized" }, 401);
  if (!RESEND_API_KEY || !TO || !FROM) return json({ error: "not_configured" }, 500);

  let record: ReportRecord | null = null;
  try {
    const body = (await req.json()) as { type?: string; table?: string; record?: ReportRecord };
    if (body.type === "INSERT" && body.table === "puzzle_reports" && body.record?.puzzle_id) record = body.record;
  } catch {
    record = null;
  }
  if (!record) return json({ error: "invalid_request" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: puzzle } = await db.from("published_puzzles").select("title, short_id, status, author_id").eq("id", record.puzzle_id).maybeSingle();
  if (!puzzle) return json({ error: "not_found" }, 404);
  const { data: profile } = await db.from("profiles").select("username").eq("user_id", puzzle.author_id).maybeSingle();
  const { count } = await db.from("puzzle_reports").select("*", { count: "exact", head: true }).eq("puzzle_id", record.puzzle_id).eq("status", "open");

  const email = reportEmail(record, { title: puzzle.title, short_id: puzzle.short_id, status: puzzle.status, author: profile?.username ?? "?", open: count ?? 1 });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [TO], subject: email.subject, text: email.text }),
  });
  if (!res.ok) return json({ error: "send_failed", status: res.status, message: (await res.text()).slice(0, 300) }, 502);
  return json({ ok: true });
});
