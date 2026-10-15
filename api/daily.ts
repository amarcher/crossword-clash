/**
 * GET /daily-puzzles/<day>.json (rewritten here by vercel.json) → that day's
 * scheduled daily from Supabase `daily_schedule`, in the same JSON shape as a
 * static feed file. Static files in public/daily-puzzles/ are served first by
 * Vercel's filesystem check, so they still win; this answers every other day,
 * with a real 404 when nothing is scheduled (dailyFeed.ts treats that as "use
 * the bundled rotation"). Row-level security hides days that haven't started.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

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
  const day = new URL(request.url).searchParams.get("day") ?? "";
  if (!DAY.test(day)) return respond(404, { error: "not_found" }, 3600);

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return respond(404, { error: "not_found" }, 60);

  try {
    const res = await fetch(`${url}/rest/v1/daily_schedule?day=eq.${day}&select=entry`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return respond(503, { error: "unavailable" }, 30);
    const rows = (await res.json()) as { entry: unknown }[];
    return rows[0]?.entry ? respond(200, rows[0].entry, 300) : respond(404, { error: "not_found" }, 120);
  } catch {
    return respond(503, { error: "unavailable" }, 30);
  }
}
