import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { studioAccess } from "../_shared/studioAuth.ts";

/**
 * The admin's report queue (docs/community-puzzles-spec.md §3.3). Admin only
 * (the STUDIO_TOKEN secret or a signed-in studio admin, like studio-schedule);
 * every read and write uses the service role, since puzzle_reports has no
 * client policy and published_puzzles has no client write policy.
 *
 *   { action: "queue" }
 *     → { items: [{ puzzle, publisher, reports }], removed: [puzzle] }
 *       items: every puzzle with an open report (held first, then by the
 *       newest report); reports carry reason, details and time, never who.
 *       removed: the last 20 removed puzzles, for Restore.
 *   { action: "dismiss", puzzleId }                → open reports dismissed, a held puzzle published again
 *   { action: "remove",  puzzleId, reason, note? } → reports upheld, status 'removed', a strike for the author
 *   { action: "ban",     puzzleId, reason, note? } → remove, plus publishers.banned_at and every other live puzzle of theirs removed ('author_blocked')
 *   { action: "restore", puzzleId }                → a removed or held puzzle published again, open reports dismissed
 */
const REASONS = ["copied", "offensive", "nonsense", "other", "copyright"];
const RECENT_REMOVED = 20;
const PUZZLE_COLUMNS =
  "id, short_id, author_id, studio_id, status, title, notes, difficulty, lang, width, height, clue_count, puzzle, plays, solves, published_at, removed_reason, moderated_at, moderation_note";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface PuzzleRow {
  id: string;
  author_id: string;
  status: string;
  [key: string]: unknown;
}

async function usernames(db: SupabaseClient, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await db.from("profiles").select("user_id, username").in("user_id", ids);
  return Object.fromEntries(((data ?? []) as { user_id: string; username: string }[]).map((p) => [p.user_id, p.username]));
}

async function queue(db: SupabaseClient) {
  const { data: reports, error } = await db
    .from("puzzle_reports")
    .select("id, puzzle_id, reason, details, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const byPuzzle = new Map<string, { id: string; reason: string; details: string; created_at: string }[]>();
  for (const r of (reports ?? []) as { id: string; puzzle_id: string; reason: string; details: string; created_at: string }[]) {
    const list = byPuzzle.get(r.puzzle_id) ?? [];
    list.push({ id: r.id, reason: r.reason, details: r.details, created_at: r.created_at });
    byPuzzle.set(r.puzzle_id, list);
  }
  const ids = [...byPuzzle.keys()];
  const puzzles = ids.length ? ((await db.from("published_puzzles").select(PUZZLE_COLUMNS).in("id", ids)).data ?? []) : [];
  const { data: removed } = await db
    .from("published_puzzles")
    .select(PUZZLE_COLUMNS)
    .eq("status", "removed")
    .order("moderated_at", { ascending: false })
    .limit(RECENT_REMOVED);
  const all = [...(puzzles as PuzzleRow[]), ...((removed ?? []) as PuzzleRow[])];
  const authors = [...new Set(all.map((p) => p.author_id))];
  const names = await usernames(db, authors);
  const { data: publishers } = authors.length ? await db.from("publishers").select("user_id, strikes, banned_at").in("user_id", authors) : { data: [] };
  const pubByUser = new Map(((publishers ?? []) as { user_id: string; strikes: number; banned_at: string | null }[]).map((p) => [p.user_id, p]));
  const withAuthor = (p: PuzzleRow) => ({ ...p, author: names[p.author_id] ?? "?" });
  const items = (puzzles as PuzzleRow[])
    .map((p) => ({
      puzzle: withAuthor(p),
      publisher: pubByUser.get(p.author_id) ?? null,
      reports: byPuzzle.get(p.id) ?? [],
    }))
    .sort((a, b) => {
      if (a.puzzle.status !== b.puzzle.status) return a.puzzle.status === "held" ? -1 : b.puzzle.status === "held" ? 1 : 0;
      return (b.reports[0]?.created_at ?? "").localeCompare(a.reports[0]?.created_at ?? "");
    });
  return { items, removed: ((removed ?? []) as PuzzleRow[]).map(withAuthor) };
}

async function resolveReports(db: SupabaseClient, puzzleId: string, status: "dismissed" | "upheld") {
  const { error } = await db.from("puzzle_reports").update({ status, resolved_at: new Date().toISOString() }).eq("puzzle_id", puzzleId).eq("status", "open");
  if (error) throw error;
}

async function puzzleById(db: SupabaseClient, id: string): Promise<PuzzleRow | null> {
  const { data, error } = await db.from("published_puzzles").select("id, author_id, status").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as PuzzleRow | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const access = await studioAccess(req);
  if (access?.kind !== "admin") return json({ error: "unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json();
    if (body.action === "queue") return json(await queue(db));

    const puzzleId = typeof body.puzzleId === "string" ? body.puzzleId : "";
    if (!puzzleId) return json({ error: "invalid_request" }, 400);
    const puzzle = await puzzleById(db, puzzleId);
    if (!puzzle) return json({ error: "not_found" }, 404);
    const now = new Date().toISOString();
    const stamp = { moderated_by: access.userId, moderated_at: now, moderation_note: typeof body.note === "string" ? body.note.slice(0, 500) : null };

    if (body.action === "dismiss") {
      await resolveReports(db, puzzleId, "dismissed");
      const { error } = await db.from("published_puzzles").update({ status: "published", ...stamp }).eq("id", puzzleId).eq("status", "held");
      if (error) throw error;
      return json({ ok: true });
    }
    if (body.action === "restore") {
      await resolveReports(db, puzzleId, "dismissed");
      const { error } = await db.from("published_puzzles").update({ status: "published", removed_reason: null, ...stamp }).eq("id", puzzleId).in("status", ["removed", "held"]);
      if (error) throw error;
      return json({ ok: true });
    }
    if (body.action === "remove" || body.action === "ban") {
      const reason = REASONS.includes(body.reason) ? (body.reason as string) : null;
      if (!reason) return json({ error: "invalid_request" }, 400);
      await resolveReports(db, puzzleId, "upheld");
      const { error } = await db.from("published_puzzles").update({ status: "removed", removed_reason: reason, ...stamp }).eq("id", puzzleId);
      if (error) throw error;
      const { data: pub } = await db.from("publishers").select("strikes").eq("user_id", puzzle.author_id).maybeSingle();
      const strikes = ((pub as { strikes: number } | null)?.strikes ?? 0) + 1;
      const ban = body.action === "ban" ? { banned_at: now, ban_reason: `${reason}${stamp.moderation_note ? `: ${stamp.moderation_note}` : ""}` } : {};
      const { error: pubError } = await db.from("publishers").upsert({ user_id: puzzle.author_id, terms_version: "admin", strikes, ...ban }, { onConflict: "user_id" });
      if (pubError) throw pubError;
      if (body.action === "ban") {
        const { data: others } = await db.from("published_puzzles").select("id").eq("author_id", puzzle.author_id).in("status", ["published", "held"]);
        for (const other of (others ?? []) as { id: string }[]) {
          await resolveReports(db, other.id, "upheld");
          await db.from("published_puzzles").update({ status: "removed", removed_reason: "author_blocked", ...stamp }).eq("id", other.id);
        }
      }
      return json({ ok: true, strikes });
    }
    return json({ error: "invalid_request" }, 400);
  } catch (err) {
    return json({ error: "internal", message: String(err) }, 500);
  }
});
