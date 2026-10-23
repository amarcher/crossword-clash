/**
 * Vercel routing middleware for the daily feed (vercel.json `proxy`,
 * matched to /daily-puzzles/* only).
 *
 * Every day's puzzle is committed as a static file under public/daily-puzzles/
 * weeks ahead, and Vercel serves static files before any rewrite, so without
 * this a future day's grid is one URL guess away. Routing middleware runs
 * before the filesystem: a feed URL for a day that has not started gets a 404
 * here, everything else falls through to the static file (or, when there is
 * none, to api/daily.ts and the schedule table).
 *
 * The release rule mirrors the `daily_schedule` RLS policy ("Started days are
 * public": day <= UTC date + 1), so a day opens at 00:00 UTC on its eve, which
 * is the moment the earliest local timezone reaches it. The 404 carries the
 * same headers as api/daily.ts so the apps' cross-origin fetch sees a plain
 * not-found and dailyFeed.ts treats it as "nothing published".
 */

import { next } from "@vercel/functions";

// The matcher lives in vercel.json (`proxy.matcher`); Vercel refuses it in both places.
export const config = { runtime: "nodejs" };

const FEED_PATH = /^\/daily-puzzles\/(?:(?:midi|large)\/)?(\d{4}-\d{2}-\d{2})\.json$/;

/** The calendar day a feed URL asks for, or null for any other path under /daily-puzzles/. */
export function feedDay(pathname: string): string | null {
  return FEED_PATH.exec(pathname)?.[1] ?? null;
}

/** The last day the feed may serve at `now`: the UTC date plus one (the schedule table's rule). */
export function lastReleasedDay(now: Date): string {
  const eve = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return eve.toISOString().slice(0, 10);
}

/** Whether `day` (YYYY-MM-DD) has started anywhere in the world, by the feed's rule. */
export function isReleased(day: string, now: Date): boolean {
  // ISO dates compare correctly as strings.
  return day <= lastReleasedDay(now);
}

export default function proxy(request: Request, _context?: unknown, now: Date = new Date()): Response {
  const day = feedDay(new URL(request.url).pathname);
  if (day === null || isReleased(day, now)) return next();
  return new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      // Short cache: the day flips to released at midnight UTC.
      "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
