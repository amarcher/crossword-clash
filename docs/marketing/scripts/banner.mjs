// YouTube channel banner: 2560×1440, everything that matters inside the centre 1546×423.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/");
const { chromium } = require("@playwright/test");
const W = 2560, H = 1440;
const css = readFileSync(process.cwd() + "/src/index.css", "utf8");
const tile = css.match(/url\("(data:image\/svg\+xml,[^"]+)"\)/)[1].replaceAll("opacity='0.04'", "opacity='0.06'");
const logo = "data:image/png;base64," + readFileSync(process.cwd() + "/public/logo.png").toString("base64");
const html = `<div id="tile" style="position:fixed;inset:0;z-index:99999;width:${W}px;height:${H}px;overflow:hidden;background:linear-gradient(180deg,#f7f9fc 0%,#f4f6fa 50%,#e9eef8 100%)">
  <div style="position:absolute;inset:0;background-image:url(&quot;${tile}&quot;);background-size:432px 432px;background-position:-80px -72px;mask-image:radial-gradient(60% 75% at 50% 50%,rgba(0,0,0,.25) 0%,rgba(0,0,0,.6) 55%,#000 100%)"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#141a26">
    <img src="${logo}" style="width:1040px">
    <div style="font:800 76px/1.05 'Bricolage Grotesque Variable',sans-serif;letter-spacing:-.025em;margin-top:44px">Crosswords are better with friends</div>
  </div></div>`;
const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
await page.goto("http://localhost:5311/support"); await page.waitForTimeout(1200);
await page.evaluate(() => document.fonts.load("800 40px 'Bricolage Grotesque Variable'"));
await page.evaluate(async (h) => { document.body.insertAdjacentHTML("beforeend", h); await Promise.all([...document.querySelectorAll("#tile img")].map((i) => i.decode())); }, html);
await page.screenshot({ path: process.env.OUT, clip: { x: 0, y: 0, width: W, height: H } });
const box = await page.evaluate(() => { const r = document.querySelector("#tile > div:last-child"); const a = r.children[0].getBoundingClientRect(), b = r.children[1].getBoundingClientRect(); return [Math.min(a.left, b.left), a.top, Math.max(a.right, b.right), b.bottom]; });
console.log("content box", box.map(Math.round), "safe", [(W - 1546) / 2, (H - 423) / 2, (W + 1546) / 2, (H + 423) / 2]);
await browser.close();
