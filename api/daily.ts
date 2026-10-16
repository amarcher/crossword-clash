/**
 * GET /daily-puzzles/<day>.json        (slot "mini")
 * GET /daily-puzzles/large/<day>.json  (slot "large")
 *
 * Both are rewritten here by vercel.json (`?day=…&slot=…`) → that day's
 * scheduled daily for that slot from Supabase `daily_schedule`, in the same
 * JSON shape as a static feed file. Static files in public/daily-puzzles/ are
 * served first by Vercel's filesystem check, so they still win; this answers
 * every other day, with a real 404 when nothing is scheduled (dailyFeed.ts
 * treats that as "use the bundled rotation" for the mini and "no large today"
 * for the large). Row-level security hides days that haven't started.
 */

// Vercel's Node runtime provides process.env; api/ has no @types/node.
declare const process: { env: Record<string, string | undefined> };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Mirrors DAILY_SLOTS in src/lib/dailyFeed.ts (api/ can't import from src/). */
const SLOTS = ["mini", "large"] as const;
export type DailySlot = (typeof SLOTS)[number];

/** Which day and slot a request asks for; null when the URL isn't a daily we serve. */
export function selectDaily(url: string): { day: string; slot: DailySlot } | null {
  const params = new URL(url).searchParams;
  const day = params.get("day") ?? "";
  const slot = params.get("slot") ?? "mini";
  if (!DAY.test(day) || !(SLOTS as readonly string[]).includes(slot)) return null;
  return { day, slot: slot as DailySlot };
}

function respond(status: number, body: unknown, maxAge: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // The apps read this cross-origin (see vercel.json's /daily-puzzles headers).
      "access-control-allow-origin": "*",
      // Short edge cache, so a newly scheduled day shows up within minutes.
      "cache-control": `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=600`,
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const wanted = selectDaily(request.url);
  if (!wanted) return respond(404, { error: "not_found" }, 3600);

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return respond(404, { error: "not_found" }, 60);

  try {
    const res = await fetch(`${url}/rest/v1/daily_schedule?day=eq.${wanted.day}&slot=eq.${wanted.slot}&select=entry`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return respond(503, { error: "unavailable" }, 30);
    const rows = (await res.json()) as { entry: unknown }[];
    return rows[0]?.entry ? respond(200, rows[0].entry, 300) : respond(404, { error: "not_found" }, 120);
  } catch {
    return respond(503, { error: "unavailable" }, 30);
  }
}
