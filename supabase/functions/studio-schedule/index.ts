import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { studioAllowed } from "../_shared/studioAuth.ts";

/**
 * The constructor's daily queue (/studio). Gated by studioAllowed (the
 * STUDIO_TOKEN secret or a signed-in studio admin), like studio-claude;
 * writes daily_schedule with the service role (the table has no public write
 * policy). A day holds one puzzle per slot: "mini" (the default, and what
 * every request without a slot means) or "large".
 *
 *   { action: "list", from: "YYYY-MM-DD", to: "YYYY-MM-DD" }  → { days: [{ day, slot, title, studio_id }] }
 *   { action: "set", day, slot?, entry: { theme?, puzzle }, title, studioId? } → { ok: true }
 *   { action: "remove", day, slot? } → { ok: true }
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Mirrors DAILY_SLOTS in src/lib/dailyFeed.ts. */
const SLOTS = ["mini", "large"];
const slotOf = (value: unknown): string | null => (value === undefined ? "mini" : SLOTS.includes(value as string) ? (value as string) : null);
const MAX_ENTRY_CHARS = 200_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });


/** Just enough shape-checking that the feed's own parser will accept it. */
function validEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const { theme, puzzle } = entry as { theme?: unknown; puzzle?: Record<string, unknown> };
  if (theme !== undefined && typeof theme !== "string") return false;
  if (!puzzle || typeof puzzle !== "object") return false;
  const size = puzzle.size as { rows?: number; cols?: number } | undefined;
  const grid = puzzle.grid as unknown[] | undefined;
  const clues = puzzle.clues as { across?: unknown[]; down?: unknown[] } | undefined;
  return (
    !!size && Number.isInteger(size.rows) && Number.isInteger(size.cols) &&
    Array.isArray(grid) && grid.length === size.rows! * size.cols! &&
    Array.isArray(puzzle.gridnums) && !!clues && Array.isArray(clues.across) && Array.isArray(clues.down) &&
    JSON.stringify(entry).length <= MAX_ENTRY_CHARS
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await studioAllowed(req))) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json();
    if (body.action === "list") {
      if (!DAY.test(body.from ?? "") || !DAY.test(body.to ?? "")) return json({ error: "invalid_request" }, 400);
      const { data, error } = await supabase
        .from("daily_schedule")
        .select("day, slot, title, studio_id")
        .gte("day", body.from)
        .lte("day", body.to)
        .order("day")
        .order("slot");
      if (error) return json({ error: "db_error", message: error.message }, 500);
      return json({ days: data });
    }
    if (body.action === "set") {
      const slot = slotOf(body.slot);
      if (!DAY.test(body.day ?? "") || !slot || !validEntry(body.entry)) return json({ error: "invalid_request" }, 400);
      // The table's primary key is (day, slot), so this replaces that slot's puzzle only.
      const { error } = await supabase.from("daily_schedule").upsert({
        day: body.day,
        slot,
        entry: body.entry,
        title: String(body.title ?? "").slice(0, 200),
        studio_id: body.studioId ? String(body.studioId).slice(0, 100) : null,
        updated_at: new Date().toISOString(),
      });
      if (error) return json({ error: "db_error", message: error.message }, 500);
      return json({ ok: true });
    }
    if (body.action === "remove") {
      const slot = slotOf(body.slot);
      if (!DAY.test(body.day ?? "") || !slot) return json({ error: "invalid_request" }, 400);
      const { error } = await supabase.from("daily_schedule").delete().eq("day", body.day).eq("slot", slot);
      if (error) return json({ error: "db_error", message: error.message }, 500);
      return json({ ok: true });
    }
    return json({ error: "invalid_request" }, 400);
  } catch (err) {
    return json({ error: "internal", message: String(err) }, 500);
  }
});
