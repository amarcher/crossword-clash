// Headless check that every PageShell page shares one edge: the logo's visible
// left edge must equal the content column's left edge and the bar's right slot
// must end on the column's right edge, at 1280 and 390 px. Prints a Markdown
// table and saves a viewport screenshot per route and width.
//
//   pnpm exec vite --port 5313 &
//   node scripts/chrome-alignment.mjs http://localhost:5313 docs/site-chrome [label]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [base, outDir, label = "after"] = process.argv.slice(2);
if (!base || !outDir) {
  console.error("usage: node scripts/chrome-alignment.mjs <baseUrl> <outDir> [label]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const ROUTES = ["/privacy", "/daily/leaderboard", "/nyt-import", "/solo/import", "/archive", "/studio", "/join", "/host-game/name", "/host-game/import"];
const SEL = { column: "[data-page-column]", logo: "[data-site-bar] img", right: "[data-site-bar-right]" };

const browser = await chromium.launch();
const rows = [];
for (const width of [1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    // "load", not "networkidle": the studio keeps a connection open.
    await page.goto(base + route, { waitUntil: "load" });
    await page.waitForSelector(SEL.column, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    const m = await page.evaluate(async (sel) => {
      const rect = (el) => el.getBoundingClientRect();
      const col = document.querySelector(sel.column);
      if (!col) return { error: "no column: " + sel.column };
      const cs = getComputedStyle(col);
      const cr = rect(col);
      const out = { colLeft: cr.left + parseFloat(cs.paddingLeft), colRight: cr.right - parseFloat(cs.paddingRight) };
      const img = document.querySelector(sel.logo);
      if (img) {
        await (img.decode?.() ?? Promise.resolve());
        // First column of the bitmap with any alpha: the logo's visible edge,
        // independent of whatever padding the asset carries.
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let first = -1;
        outer: for (let x = 0; x < c.width; x++) for (let y = 0; y < c.height; y++) if (d[(y * c.width + x) * 4 + 3] > 8) { first = x; break outer; }
        const ir = rect(img);
        out.logoVisibleLeft = ir.left + (first / c.width) * ir.width;
      }
      const right = document.querySelector(sel.right);
      if (right) {
        const rr = rect(right);
        out.rightEdge = rr.right;
        out.rightW = rr.width;
        out.rightH = rr.height;
      }
      return out;
    }, SEL);
    const name = route.replace(/^\//, "").replace(/\//g, "-");
    await page.screenshot({ path: `${outDir}/${label}-${name}-${width}.jpg`, type: "jpeg", quality: 80 });
    rows.push({ width, route, ...m });
  }
  await ctx.close();
}
await browser.close();

const f = (n) => (n === undefined ? "—" : Math.round(n * 10) / 10);
let failures = 0;
console.log("| width | route | column L–R | logo visible L | Δ logo | right slot R | Δ right | right slot box |");
console.log("|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  if (r.error) { failures++; console.log(`| ${r.width} | ${r.route} | ${r.error} |`); continue; }
  const dl = r.logoVisibleLeft === undefined ? undefined : r.logoVisibleLeft - r.colLeft;
  const dr = r.rightEdge === undefined ? undefined : r.rightEdge - r.colRight;
  if (Math.abs(dl ?? 0) > 0.5 || Math.abs(dr ?? 0) > 0.5) failures++;
  console.log(`| ${r.width} | ${r.route} | ${f(r.colLeft)}–${f(r.colRight)} | ${f(r.logoVisibleLeft)} | ${f(dl)} | ${f(r.rightEdge)} | ${f(dr)} | ${r.rightW === undefined ? "—" : `${f(r.rightW)}×${f(r.rightH)}`} |`);
}
console.log(failures ? `\n${failures} misaligned` : "\nall aligned");
process.exit(failures ? 1 : 0);
