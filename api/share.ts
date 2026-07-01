/**
 * Rich share links (Vercel Edge).
 *
 * GET /share?t=race&code=ABC123&title=…        → invite card + redirect to /?join=ABC123
 * GET /share?t=result&title=…&time=1:42&rank=1&total=4&name=…
 *                                              → boast card + redirect to /
 *
 * Crawlers (iMessage/Slack/Twitter/…) read the OG meta tags — including a
 * per-link og:image rendered by /api/og — and never follow the redirect.
 * Humans hit the instant meta-refresh/JS redirect into the SPA.
 *
 * URL builders live in src/lib/shareLinks.ts (pure, unit-tested). This file is
 * outside the Vite/tsc project; Vercel compiles it for the Edge runtime.
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

export default function handler(req: Request): Response {
  const url = new URL(req.url);
  const origin = url.origin;
  const type = clean(url, "t", 10);
  const title = clean(url, "title", 80);

  let pageTitle: string;
  let description: string;
  let dest: string; // same-origin path ONLY — never taken from user input
  const og = new URLSearchParams();

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
    pageTitle = "Crossword Clash — Real-Time Multiplayer Crossword Puzzles";
    description =
      "Compete head-to-head in real-time multiplayer crossword puzzles. Import any puzzle, host a room, and race friends to fill the grid.";
    dest = "/";
    og.set("heading", "Crossword Clash");
    og.set("detail", "Race friends to fill the grid");
    og.set("glyph", "🧩");
  }

  const image = `${origin}/api/og?${og.toString()}`;
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
