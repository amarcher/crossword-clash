// The 16:9 cut of the studio video: 1920×1080, 30 fps, rendered frame by frame from real captures.
// Frames are drawn at 2× and scaled down, so slow moves land between pixels
// instead of stepping from one to the next.
import { mkdirSync, existsSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/");
const { chromium } = require("@playwright/test");
const ST = process.env.ST, OUT = ST + "/reel/frames-studio-wide";
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const W = 1920, H = 1080, u = 10.8;
const seq = (dir) => readdirSync(ST + "/frames/" + dir).filter((f) => f.endsWith(".jpg")).sort().map((f) => "frames/" + dir + "/" + f);
const rpt = (x, n) => Array(n).fill(x);
const layout = seq("st-layout"), fill = seq("st-fill"), cl = seq("st-clues"), pub = seq("st-publish"), rc = seq("st-race");
const clues = [...cl.slice(0, 4), ...cl.slice(4, 12), ...rpt(cl[cl.length - 1], 16)];
const race = [...rpt("studio/race-0-landing.png", 9), ...rpt("studio/race-2-lobby.png", 9), ...rc, ...rpt(rc[rc.length - 1], 8)];
const publish = [...pub, ...rpt(pub[pub.length - 1], 3), ...rpt("studio/community.png", 16)];
const at = (list, t) => list[Math.min(list.length - 1, Math.floor(t * list.length))];
const clamp = (x) => Math.min(1, Math.max(0, x));
const out5 = (x) => 1 - Math.pow(1 - clamp(x), 5);
const inOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
// The site's .crossword-bg tile (src/index.css), with the ink colour swappable.
const css = readFileSync(process.cwd() + "/src/index.css", "utf8");
const tile = css.match(/url\("(data:image\/svg\+xml,[^"]+)"\)/)[1];
const pattern = (ink, op) => tile.replaceAll("%23000", ink).replaceAll("opacity='0.04'", `opacity='${op}'`).replace("stroke-width='0.5'", "stroke-width='0.6'");
const BADGES = existsSync(ST + "/badges/app-store.svg") && existsSync(ST + "/badges/google-play.png");
const SCENES = [
  { n: 60, kind: "title", chip: true, title: "Make your own<br>crossword" },
  { n: 135, kind: "phone", img: (t) => at(layout, t), title: "Start with<br>your words", sub: "Type your theme entries. The studio lays out the grid." },
  { n: 90, kind: "phone", img: (t) => at(fill, t), title: "Fill the grid<br>in one tap", sub: "A real construction engine finds words that fit." },
  { n: 120, kind: "phone", img: (t) => at(clues, t), title: "Clues drafted<br>by AI", sub: "Keep them, redraft them or write your own." },
  { n: 165, kind: "phone", img: (t) => at(race, t), title: "Race your<br>friends on it", sub: "Start a room from your own puzzle." },
  { n: 120, kind: "phone", img: (t) => at(publish, t), title: "Publish it to<br>the community", sub: "Other players can solve it or race on it." },
  { n: 105, kind: "title", title: "Build yours<br>in the studio", note: "The studio comes with Crossword Clash Plus.", end: true },
];
const starts = []; { let a = 0; for (const s of SCENES) { starts.push(a); a += s.n; } }
const FADE = 10; // frames a light↔dark background change takes, centred on the cut
const backdrop = (g) => {
  const i = SCENES.findIndex((s, k) => g >= starts[k] && g < starts[k] + s.n), s = SCENES[i], f = g - starts[i];
  const here = s.plus ? 1 : 0, prev = SCENES[i - 1]?.plus ? 1 : 0, next = SCENES[i + 1]?.plus ? 1 : 0;
  let dark = here;
  if (f < FADE / 2 && prev !== here) dark = prev + (here - prev) * (0.5 + f / FADE);
  if (s.n - f <= FADE / 2 && next !== here) dark = here + (next - here) * (0.5 - (s.n - f) / FADE);
  const drift = g * 0.35, size = 54 * 8;
  const layer = (ink, op, bg, o) => `<div style="position:absolute;inset:0;opacity:${o};background:${bg}"><div style="position:absolute;inset:0;background-image:url(&quot;${pattern(ink, op)}&quot;);background-size:${size}px ${size}px;background-position:${-drift}px ${-drift * 0.6}px;mask-image:linear-gradient(180deg,#000 0%,rgba(0,0,0,.55) 45%,rgba(0,0,0,.2) 100%)"></div></div>`;
  return layer("%23000", 0.06, "linear-gradient(180deg,#f7f9fc 0%,#f4f6fa 50%,#e9eef8 100%)", 1) + layer("%23fff", 0.055, "radial-gradient(120% 70% at 50% 0%,#1d2947 0%,#0e1320 70%)", dark);
};
const device = (src, w, r = 7, bez = 1.2) => `<div style="width:${w * u}px;padding:${bez * u}px;border-radius:${r * u}px;background:#0b0f1a;box-shadow:0 ${5 * u}px ${11 * u}px rgba(20,26,38,.28),0 ${1.2 * u}px ${2.6 * u}px rgba(20,26,38,.22),inset 0 0 0 ${0.18 * u}px #2a3247"><img src="/__store/${src}" style="display:block;width:100%;border-radius:${(r - bez) * u}px;background:#fff"></div>`;
const frameHtml = (s, f, g) => {
  const t = f / (s.n - 1), exit = s.end ? 0 : inOut((f - (s.n - 8)) / 7), gone = 1 - exit;
  const rise = (delay, dist, len = 20) => { const a = out5((f - delay) / len); return `opacity:${Math.min(a * 1.6, 1) * gone};transform:translateY(${(1 - a) * dist * u - exit * 2.5 * u}px)`; };
  const ink = s.plus ? "#fff" : "#141a26", soft = s.plus ? "#c9d2e6" : "#4b5670";
  const wrap = (inner) => `<div id="tile" style="position:fixed;inset:0;z-index:99999;width:${W}px;height:${H}px;overflow:hidden;background:#f4f6fa">${backdrop(g)}${inner}</div>`;
  if (s.kind === "title") {
    return wrap(`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:${ink};opacity:${gone}">
      <div id="lg" data-lf="${Math.min(90, f * 2)}" style="width:${78 * u}px;aspect-ratio:1222/326"></div>
      ${s.chip ? `<div style="background:#f5bd2c;color:#141a26;font:800 ${2.7 * u}px 'Figtree Variable',sans-serif;letter-spacing:.14em;padding:${0.9 * u}px ${2.2 * u}px;border-radius:999px;margin-top:${4 * u}px;${rise(22, 3)}">CROSSWORD CLASH PLUS</div>` : ""}
      <div style="font:800 ${(s.end ? 9.4 : 8.2) * u}px/1.05 'Bricolage Grotesque Variable',sans-serif;letter-spacing:-.025em;margin-top:${(s.chip ? 2.4 : 4) * u}px;${rise(28, 3)}">${s.title}</div>
      ${s.note ? `<div style="font:500 ${3.6 * u}px/1.3 'Figtree Variable',sans-serif;color:#4b5670;margin-top:${2.6 * u}px;${rise(34, 3)}">${s.note}</div>` : ""}
      ${s.end && BADGES ? `<div style="display:flex;gap:${3 * u}px;align-items:center;margin-top:${4.5 * u}px;${rise(42, 3)}"><img src="/__store/badges/app-store.svg" style="height:${11 * u}px"><img src="/__store/badges/google-play.png" style="height:${16.37 * u}px;margin:${-2.68 * u}px"></div>` : ""}
    </div>`);
  }
  const chip = s.plus ? `<div style="display:inline-block;background:#f5bd2c;color:#141a26;font:800 ${2.7 * u}px 'Figtree Variable',sans-serif;letter-spacing:.14em;padding:${0.9 * u}px ${2.2 * u}px;border-radius:999px;margin-bottom:${2.2 * u}px">CROSSWORD CLASH PLUS</div><br>` : "";
  const a = out5((f - 3) / 26), zoom = 1 + 0.03 * t;
  const cardStyle = `opacity:${Math.min(a * 1.5, 1) * gone};transform:translateY(${(1 - a) * 16 * u - exit * 3 * u}px) scale(${(0.94 + 0.06 * a) * zoom});transform-origin:50% 0;will-change:transform`;
  const body = s.kind === "tv"
    ? `<div style="position:relative;${cardStyle}">${device(s.img(t), 83, 2.4, 1.2)}<div style="position:absolute;right:${-3 * u}px;top:${24 * u}px;${rise(10, 10, 26)}">${device(s.img2(t), 22, 2.3, 0.5)}</div></div>`
    : `<div style="${cardStyle}">${device(s.img(t), 39, 4, 0.75)}</div>`;
  return wrap(`<div style="position:absolute;inset:0;display:flex;align-items:center;color:${ink}">
      <div style="flex:none;width:${(s.kind === "tv" ? 78 : 88) * u}px;box-sizing:border-box;padding-left:${12 * u}px;position:relative;z-index:2">
        <div style="${rise(0, 3)}">${chip}<div style="font:800 ${8.2 * u}px/1.02 'Bricolage Grotesque Variable',sans-serif;letter-spacing:-.025em;white-space:nowrap">${s.title}</div></div>
        <div style="font:500 ${3.4 * u}px/1.3 'Figtree Variable',sans-serif;margin-top:${2.4 * u}px;max-width:${56 * u}px;color:${soft};text-wrap:balance;${rise(5, 3)}">${s.sub}</div>
      </div>
      <div style="flex:1;display:flex;justify-content:center;align-items:${s.kind === "tv" ? "flex-start" : "center"};align-self:stretch;${s.kind === "tv" ? `padding-top:${16 * u}px;padding-right:${5 * u}px` : `padding-right:${8 * u}px`}">${body}</div>
    </div>`);
};
const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })).newPage();
await page.route("**/__store/**", (r) => { const f = ST + "/" + r.request().url().split("/__store/")[1]; return existsSync(f) ? r.fulfill({ path: f, headers: { "cache-control": "max-age=3600" } }) : r.fulfill({ status: 404 }); });
await page.goto("http://localhost:5311/support"); await page.waitForTimeout(1200);
await page.evaluate(() => Promise.all([document.fonts.load("800 40px 'Bricolage Grotesque Variable'"), document.fonts.load("500 20px 'Figtree Variable'"), document.fonts.load("800 20px 'Figtree Variable'")]));
await page.addScriptTag({ path: process.cwd() + "/node_modules/.pnpm/lottie-web@5.13.0/node_modules/lottie-web/build/player/lottie.min.js" });
await page.evaluate((data) => { const h = document.createElement("div"); h.style.cssText = "width:100%;height:100%"; document.body.appendChild(h); window.__host = h; window.__anim = lottie.loadAnimation({ container: h, renderer: "svg", loop: false, autoplay: false, animationData: data }); }, JSON.parse(readFileSync(process.cwd() + "/src/assets/logo-intro.json", "utf8")));
const only = process.env.ONLY?.split(",").map(Number);
let g = 0;
for (const s of SCENES) for (let f = 0; f < s.n; f++, g++) {
  if (only && !only.includes(g)) continue;
  await page.evaluate(async (h) => { const old = document.getElementById("tile"); document.body.insertAdjacentHTML("beforeend", h); const all = document.querySelectorAll("#tile"); const fresh = all[all.length - 1]; const lg = fresh.querySelector("#lg"); if (lg) { lg.appendChild(window.__host); window.__anim.goToAndStop(Number(lg.dataset.lf), true); } await Promise.all([...fresh.querySelectorAll("img")].map((i) => i.decode().catch(() => {}))); old?.remove(); }, frameHtml(s, f, g));
  for (let k = 0; ; k++) { try { await page.screenshot({ path: OUT + "/" + String(g + 1).padStart(5, "0") + ".jpg", type: "jpeg", quality: 92, timeout: 15000, clip: { x: 0, y: 0, width: W, height: H } }); break; } catch (e) { if (k >= 3) throw e; } }
}
console.log("frames", g, "seconds", g / 30);
await browser.close();
