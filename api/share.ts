/**
 * Rich share links (Vercel Edge).
 *
 * GET /share?t=race&code=ABC123&title=…        → invite card + redirect to /?join=ABC123
 * GET /share?t=result&title=…&time=1:42&rank=1&total=4&name=…
 *                                              → boast card + redirect to /
 * GET /daily/2026-10-20/mini?beat=102&by=Archer (rewritten here by vercel.json
 *     as ?t=daily&day=…&slot=…, the original query merged in)
 *                                              → "beat my time" card, and the
 *                                                SPA itself: the built
 *                                                index.html with the card's
 *                                                tags spliced into its head,
 *                                                so the short daily link both
 *                                                unfurls and plays.
 *
 * Crawlers (iMessage/Slack/Twitter/…) read the OG meta tags — including a
 * per-link og:image rendered by /api/og — and never follow the redirect.
 * Humans hit the instant meta-refresh/JS redirect into the SPA (or, for the
 * daily link, simply get the SPA).
 *
 * URL builders live in src/lib/shareLinks.ts and src/lib/dailyChallenge.ts
 * (pure, unit-tested). This file is outside the Vite/tsc project; Vercel
 * compiles it for the Edge runtime.
 */

export const config = { runtime: "edge" };

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clean(url: URL, key: string, max: number): string {
  const raw = url.searchParams.get(key) ?? "";
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max).trim();
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SLOT_LABEL: Record<string, string> = { mini: "Daily Mini", midi: "Daily Midi", large: "Daily Large" };

/** "1:42" from whole seconds; "" for anything unusable. */
export function formatSeconds(raw: string): string {
  if (!/^\d{1,6}$/.test(raw)) return "";
  const total = Number(raw);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** "Oct 20" from a YYYY-MM-DD key (UTC-safe: the key is a calendar day, not an instant). */
export function formatDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
  );
}

/** Meta tags for the daily link, as [name, content] (property for og:, name for the rest). */
export interface HeadTags {
  title: string;
  description: string;
  image: string;
  url: string;
}

/**
 * Replace the page's own title and social tags with the card's, so crawlers
 * that take the first tag they see get the result, not the generic site.
 */
export function spliceHead(html: string, tags: HeadTags): string {
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*|description)"[^>]*>\s*/gi, "");
  const head = `<title>${esc(tags.title)}</title>
<meta name="description" content="${esc(tags.description)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Crossword Clash" />
<meta property="og:title" content="${esc(tags.title)}" />
<meta property="og:description" content="${esc(tags.description)}" />
<meta property="og:url" content="${esc(tags.url)}" />
<meta property="og:image" content="${esc(tags.image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(tags.title)}" />
<meta name="twitter:description" content="${esc(tags.description)}" />
<meta name="twitter:image" content="${esc(tags.image)}" />
`;
  return stripped.includes("<head>") ? stripped.replace("<head>", `<head>\n${head}`) : head + stripped;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = url.origin;
  const type = clean(url, "t", 10);
  const title = clean(url, "title", 80);

  let pageTitle: string;
  let description: string;
  let dest: string; // same-origin path ONLY — never taken from user input
  const og = new URLSearchParams();

  if (type === "daily") {
    const day = clean(url, "day", 10);
    const slot = clean(url, "slot", 5);
    const time = formatSeconds(clean(url, "beat", 6));
    const by = clean(url, "by", 40);
    const label = SLOT_LABEL[slot];
    if (!DAY.test(day) || !label) {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
    }
    const date = formatDay(day);
    const who = by || "I";
    pageTitle = time
      ? `${who} solved the ${label} for ${date} in ${time} — beat my time`
      : `Play the ${label} for ${date} on Crossword Clash`;
    description = time
      ? `Same puzzle, your clock. Tap to race ${by ? `${by}'s` : "this"} time on Crossword Clash.`
      : "Tap to play this daily on Crossword Clash — solo, or race friends live.";
    const query = new URLSearchParams();
    if (time) query.set("beat", clean(url, "beat", 6));
    if (by) query.set("by", by);
    dest = `/daily/${day}/${slot}${query.size ? `?${query.toString()}` : ""}`;
    og.set("heading", `${label} · ${date}`);
    if (by) og.set("title", by);
    if (time) og.set("metric", time);
    og.set("detail", time ? "Beat my time" : "Play it");
    og.set("glyph", time ? "⏱" : "🧩");

    const image = `${origin}/api/og?${og.toString()}`;
    const tags: HeadTags = { title: pageTitle, description, image, url: `${origin}${dest}` };
    // Serve the real app with the card's tags: humans play, crawlers unfurl.
    try {
      const res = await fetch(`${origin}/index.html`, { headers: { accept: "text/html" } });
      if (res.ok) {
        const html = await res.text();
        return new Response(spliceHead(html, tags), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=300" },
        });
      }
    } catch {
      // Fall back to the card-plus-redirect page below (the front door, since
      // redirecting to the daily path would land back here).
    }
    dest = "/";
    return redirectPage(tags, dest, origin);
  }

  if (type === "race") {
    const code = clean(url, "code", 6).toUpperCase().replace(/[^A-Z0-9]/g, "");
    pageTitle = title
      ? `Join my crossword race: ${title}`
      : "Join my crossword race!";
    description = code
      ? `Room ${code} — tap to jump into the grid on Crossword Clash.`
      : "Tap to jump into the grid on Crossword Clash.";
    dest = code ? `/?join=${code}` : "/";
    og.set("heading", "Live crossword race!");
    if (title) og.set("title", title);
    if (code) og.set("metric", code);
    og.set("detail", "Tap to join the room");
    og.set("glyph", "⚔️");
  } else if (type === "result") {
    const time = clean(url, "time", 10).replace(/[^0-9:]/g, "");
    const rank = clean(url, "rank", 4).replace(/\D/g, "");
    const total = clean(url, "total", 4).replace(/\D/g, "");
    const name = clean(url, "name", 40);
    const who = name || "I";
    pageTitle = time
      ? `${who} solved ${title ? `“${title}”` : "a crossword"} in ${time}`
      : `${who} solved ${title ? `“${title}”` : "a crossword"}`;
    description = "Think you can beat that? Play Crossword Clash — race friends live or take on today's mini.";
    dest = "/";
    og.set("heading", "Solved!");
    if (title) og.set("title", title);
    if (time) og.set("metric", time);
    if (rank && total) {
      og.set("detail", rank === "1" ? `Victory! #1 of ${total}` : `Finished #${rank} of ${total}`);
      og.set("glyph", rank === "1" ? "🏆" : "🧩");
    } else {
      og.set("detail", "Can you beat this time?");
    }
  } else {
    pageTitle = "Free Daily Mini, Midi & Large Crosswords — Crossword Clash";
    description =
      "Three free crosswords a day — a mini, a midi and a full-size large. Solve solo, or race friends live on the same grid.";
    dest = "/";
    og.set("heading", "Crossword Clash");
    og.set("detail", "Race friends to fill the grid");
    og.set("glyph", "🧩");
  }

  const image = `${origin}/api/og?${og.toString()}`;
  return redirectPage({ title: pageTitle, description, image, url: `${origin}${dest}` }, dest, origin);
}

/** The card page for crawlers plus an instant redirect into the SPA for humans. */
function redirectPage(tags: HeadTags, dest: string, origin: string): Response {
  const pageTitle = tags.title;
  const description = tags.description;
  const image = tags.image;
  const destUrl = `${origin}${dest}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(pageTitle)}</title>
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Crossword Clash" />
<meta property="og:title" content="${esc(pageTitle)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(destUrl)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(pageTitle)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(image)}" />
<meta http-equiv="refresh" content="0;url=${esc(destUrl)}" />
<script>location.replace(${JSON.stringify(destUrl)});</script>
</head>
<body>
<p>Redirecting to <a href="${esc(destUrl)}">Crossword Clash</a>…</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
