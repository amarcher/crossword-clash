/**
 * Drawing the result card — impure DOM glue over the pure layout in
 * resultCard.ts. Used by the "Save image" secondary action.
 */

import type { ResultCardText } from "./resultCard";

const CARD_W = 1200;
const CARD_H = 630;

/** Draw the result card onto a canvas. */
export function drawCard(card: ResultCardText): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Background — deep indigo gradient.
  const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  grad.addColorStop(0, "#1e1b4b");
  grad.addColorStop(1, "#312e81");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.textAlign = "center";
  const cx = CARD_W / 2;

  // Outcome glyph + heading (trophy only for an actual win — see resultGlyph).
  ctx.font = "96px serif";
  ctx.fillText(card.glyph, cx, 190);

  ctx.fillStyle = "#a5b4fc";
  ctx.font = "600 44px system-ui, sans-serif";
  ctx.fillText(card.heading, cx, 270);

  // Puzzle title (truncated to fit).
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 56px system-ui, sans-serif";
  ctx.fillText(fit(ctx, card.title, CARD_W - 160), cx, 360);

  // Headline metric (finish time / outcome).
  if (card.metric) {
    ctx.fillStyle = "#fde68a";
    ctx.font = "800 100px system-ui, sans-serif";
    ctx.fillText(fit(ctx, card.metric, CARD_W - 120), cx, 470);
  }

  // Optional detail.
  if (card.detail) {
    ctx.fillStyle = "#c7d2fe";
    ctx.font = "500 40px system-ui, sans-serif";
    ctx.fillText(card.detail, cx, 535);
  }

  // Brand tag.
  ctx.fillStyle = "#818cf8";
  ctx.font = "600 36px system-ui, sans-serif";
  ctx.fillText(card.tag, cx, 595);

  return canvas;
}

/** Truncate text with an ellipsis so it fits within maxWidth. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + "…";
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer the revoke: revoking synchronously after click() aborts the download
  // in Safari/Firefox (the browser hasn't finished reading the blob yet).
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
