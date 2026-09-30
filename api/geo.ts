/**
 * GET /api/geo → { country: "DE" | null }
 *
 * Tells the SPA whether to show the cookie-consent banner (EEA/UK/CH). Vercel
 * adds the visitor's country as `x-vercel-ip-country`; nothing is stored or
 * logged here. Outside Vercel (local dev) the header is absent and the client
 * falls back to a timezone guess.
 */

export function GET(request: Request): Response {
  const country = request.headers.get("x-vercel-ip-country");
  return new Response(JSON.stringify({ country: country && /^[A-Z]{2}$/.test(country) ? country : null }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Per-visitor answer: never cache at the edge or in shared caches.
      "cache-control": "private, no-store",
    },
  });
}
