/**
 * Dynamic Open Graph card renderer (Vercel Edge + @vercel/og).
 *
 * GET /api/og?heading=…&title=…&metric=…&detail=…&glyph=…
 *
 * Generic display params (composed by api/share.ts, but callable directly):
 *   heading — small eyebrow line, e.g. "Solved!" / "Crossword race!"
 *   title   — puzzle title / daily theme
 *   metric  — the big line: a time ("1:42") or a room code ("ABC123")
 *   detail  — secondary line, e.g. "Finished #1 of 4" / "Tap to join"
 *   glyph   — emoji headline (default 🏆)
 *
 * The layout mirrors the in-app canvas result card (resultCard.ts /
 * ShareResultButton) so shared images feel consistent everywhere.
 *
 * NOTE: this file lives outside the Vite/tsc project (tsconfig includes src/
 * only); Vercel compiles it for the Edge runtime. Element trees are plain
 * object literals so no JSX tooling is needed.
 */

import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

type Node = { type: string; props: Record<string, unknown> };

function el(
  type: string,
  style: Record<string, unknown>,
  children?: Node[] | string,
): Node {
  return { type, props: { style, children } };
}

/** Strip control chars and clamp — these strings come from the URL. */
function param(url: URL, key: string, max: number, fallback = ""): string {
  const raw = url.searchParams.get(key) ?? fallback;
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
}

export default function handler(req: Request) {
  const url = new URL(req.url);
  const heading = param(url, "heading", 60, "Crossword Clash");
  const title = param(url, "title", 80);
  const metric = param(url, "metric", 24);
  const detail = param(url, "detail", 80);
  const glyph = param(url, "glyph", 8, "🏆");

  const children: Node[] = [
    el("div", { fontSize: 96, marginBottom: 8 }, glyph),
    el(
      "div",
      { fontSize: 44, fontWeight: 600, color: "#a5b4fc", marginBottom: 18 },
      heading,
    ),
  ];
  if (title) {
    children.push(
      el(
        "div",
        {
          fontSize: 56,
          fontWeight: 700,
          color: "#ffffff",
          marginBottom: 14,
          maxWidth: 1040,
          textAlign: "center",
        },
        title,
      ),
    );
  }
  if (metric) {
    children.push(
      el(
        "div",
        {
          fontSize: 108,
          fontWeight: 800,
          color: "#fde68a",
          letterSpacing: metric.length <= 8 ? 12 : 0,
          marginBottom: 6,
        },
        metric,
      ),
    );
  }
  if (detail) {
    children.push(
      el("div", { fontSize: 40, fontWeight: 500, color: "#c7d2fe" }, detail),
    );
  }
  children.push(
    el(
      "div",
      {
        position: "absolute",
        bottom: 36,
        fontSize: 36,
        fontWeight: 600,
        color: "#818cf8",
      },
      "crosswordclash.com",
    ),
  );

  const root = el(
    "div",
    {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
      fontFamily: "system-ui, sans-serif",
      position: "relative",
    },
    children,
  );

  return new ImageResponse(
    // @vercel/og accepts ReactElement-shaped object literals.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    root as any,
    {
      width: 1200,
      height: 630,
      headers: {
        // Cards are immutable for a given query string — cache hard at the edge.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}
