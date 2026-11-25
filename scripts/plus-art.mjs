/**
 * Prepares Daily Plus card drawings (BonusCard, src/lib/bonus.ts `bonusArtUrl`).
 *
 *   pnpm plus:art <folder of YYYY-MM-DD.png> [public/plus-art]
 *
 * Each PNG (a line drawing on white, approved by Andrew) is trimmed to its ink
 * plus a small margin, near-white is made pure white (the card multiplies the
 * image onto its own fill), and it is written as <day>.webp, at most 720 px.
 * A drawing that touches the source's edge is reported: it was cropped there.
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const [src, out = "public/plus-art"] = process.argv.slice(2);
if (!src) {
  console.error("Usage: pnpm plus:art <folder of YYYY-MM-DD.png> [public/plus-art]");
  process.exit(1);
}
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
for (const f of readdirSync(src).filter((f) => /^\d{4}-\d{2}-\d{2}\.png$/.test(f))) {
  const b64 = readFileSync(`${src}/${f}`).toString("base64");
  const res = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let l = c.width, r = 0, t = c.height, b = 0;
    for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++) { const o = (y * c.width + i) * 4; if (d[o] < 225 || d[o + 1] < 225 || d[o + 2] < 225) { if (i < l) l = i; if (i > r) r = i; if (y < t) t = y; if (y > b) b = y; } }
    const pad = Math.round(Math.max(r - l, b - t) * 0.04);
    l = Math.max(0, l - pad); t = Math.max(0, t - pad); r = Math.min(c.width - 1, r + pad); b = Math.min(c.height - 1, b + pad);
    const w = r - l + 1, h = b - t + 1, s = Math.min(1, 720 / Math.max(w, h));
    const o = document.createElement("canvas"); o.width = Math.round(w * s); o.height = Math.round(h * s);
    const ox = o.getContext("2d"); ox.fillStyle = "#fff"; ox.fillRect(0, 0, o.width, o.height); ox.imageSmoothingQuality = "high"; ox.drawImage(c, l, t, w, h, 0, 0, o.width, o.height); const od = ox.getImageData(0, 0, o.width, o.height); for (let k = 0; k < od.data.length; k += 4) if (od.data[k] > 242 && od.data[k+1] > 242 && od.data[k+2] > 242) od.data[k] = od.data[k+1] = od.data[k+2] = 255; ox.putImageData(od, 0, 0);
    return { data: o.toDataURL("image/webp", 0.92).split(",")[1], w: o.width, h: o.height, edge: [l === 0, t === 0, r === c.width - 1, b === c.height - 1] };
  }, b64);
  writeFileSync(`${out}/${f.replace(".png", ".webp")}`, Buffer.from(res.data, "base64"));
  console.log(f, res.w + "x" + res.h, Math.round(res.data.length * 0.75 / 1024) + "KB", res.edge.some(Boolean) ? "TOUCHES EDGE " + res.edge : "");
}
await browser.close();
