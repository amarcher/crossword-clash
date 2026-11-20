// Store tiles: a headline over the capture on the site's crossword backdrop,
// at each store's exact pixel size.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { DEVICES } from "./cap.mjs";

/** Every tile, in store order. Apple shows up to ten per set; Play takes eight, so
 * the Play sets leave out the two marked `apple`. */
const ALL = [
  { name: "race-friends", shot: "room-mid", title: "Race friends<br>on one grid", sub: "Every square goes to whoever gets it first." },
  { name: "dailies", shot: "menu", title: "Three new<br>crosswords a day", sub: "A mini, a midi and a full-size. Free." },
  { name: "race-a-solve", shot: "ghosts", title: "Race anyone's<br>finished solve", sub: "Their squares fill in as you go, on your clock." },
  { name: "the-race", shot: "race", title: "See who got<br>there first", sub: "Everyone's solves, replayed on one clock." },
  { name: "tv", shot: "room-mid", tv: true, title: "Game night on<br>the big screen", sub: "The board on your TV. Everyone plays from their own device." },
  { name: "leaderboard", shot: "board", title: "Climb the<br>daily leaderboard", sub: "Solve today's puzzle and see where you land." },
  { name: "community", shot: "community", apple: true, title: "Solve what<br>players make", sub: "Crosswords made by players. Play one, or race a friend on it." },
  { name: "studio", shot: "studio", plus: true, title: "Make your<br>own crossword", sub: "Lay out, fill and clue it in the studio. Then publish it." },
  { name: "stats", shot: "stats", plus: true, title: "Know your<br>solving stats", sub: "Trends, ranks and head-to-heads with friends." },
  { name: "archive", shot: "archive", plus: true, apple: true, title: "Play every<br>past daily", sub: "The whole archive, whenever you like." },
];
/** A set's tiles, numbered in order: `01-race-friends` … */
export const tilesFor = (dev) => ALL.filter((t) => DEVICES[dev].platform === "ios" || !t.apple).map((t, i) => ({ ...t, id: `${String(i + 1).padStart(2, "0")}-${t.name}` }));

const css = readFileSync("src/index.css", "utf8");
const backdrop = css.match(/url\("(data:image\/svg\+xml,[^"]+)"\)/)[1];
const pattern = (ink, op) => backdrop.replaceAll("%23000", ink).replaceAll("opacity='0.04'", `opacity='${op}'`).replace("stroke-width='0.5'", "stroke-width='0.6'");

const html = (t, dev, W, H) => {
  const wide = W / H > 0.7; // tablets
  const u = W / 100;
  const bg = t.plus ? "radial-gradient(120% 70% at 50% 0%,#1d2947 0%,#0e1320 70%)" : "linear-gradient(180deg,#f7f9fc 0%,#f4f6fa 50%,#e9eef8 100%)";
  const ink = t.plus ? "#fff" : "#141a26", soft = t.plus ? "#c9d2e6" : "#4b5670";
  const chip = t.plus ? `<div style="display:inline-block;background:#f5bd2c;color:#141a26;font:800 ${(wide ? 1.9 : 2.6) * u}px 'Figtree Variable',sans-serif;letter-spacing:.14em;padding:${0.9 * u}px ${2.2 * u}px;border-radius:999px;margin-bottom:${2.2 * u}px">CROSSWORD CLASH PLUS</div><br>` : "";
  const device = (src, w, r = wide ? 3.2 : 7, bez = wide ? 0.8 : 1.2) => `<div style="width:${w * u}px;padding:${bez * u}px;border-radius:${r * u}px;background:#0b0f1a;box-shadow:0 ${5 * u}px ${11 * u}px rgba(20,26,38,.28),0 ${1.2 * u}px ${2.6 * u}px rgba(20,26,38,.22),inset 0 0 0 ${0.18 * u}px #2a3247"><img src="/__store/${dev}/${src}.png" style="display:block;width:100%;border-radius:${(r - bez) * u}px;background:#fff"></div>`;
  const body = t.tv
    ? `<div style="display:flex;flex-direction:column;align-items:center">${device("tv-game-mid", 92, 2.6, 1.3)}<div style="margin-top:${-9 * u}px">${device(t.shot, wide ? 40 : 54)}</div></div>`
    : `<div style="display:flex;justify-content:center">${device(t.shot, wide ? 78 : 80)}</div>`;
  return `<div id="tile" style="position:fixed;inset:0;z-index:99999;width:${W}px;height:${H}px;overflow:hidden;background:${bg}">
    <div style="position:absolute;inset:0;background-image:url(&quot;${pattern(t.plus ? "%23fff" : "%23000", t.plus ? 0.055 : 0.06)}&quot;);background-size:${40 * u}px ${40 * u}px;mask-image:linear-gradient(180deg,#000 0%,rgba(0,0,0,.55) 45%,rgba(0,0,0,.2) 100%)"></div>
    <div style="position:relative;text-align:center;padding:${(wide ? 6.5 : 10) * u}px ${6 * u}px ${(wide ? 4.5 : 6.5) * u}px;color:${ink}">
      ${chip}<div style="font:800 ${(wide ? 7.4 : 10.4) * u}px/1.02 'Bricolage Grotesque Variable',sans-serif;letter-spacing:-.025em;text-wrap:balance">${wide ? t.title.replace("<br>", " ") : t.title}</div>
      <div style="font:500 ${(wide ? 2.9 : 4.1) * u}px/1.3 'Figtree Variable',sans-serif;margin-top:${(wide ? 1.8 : 2.8) * u}px;color:${soft};text-wrap:balance">${t.sub}</div>
    </div>${body}</div>`;
};

/** Writes the tiles of each device into `outFor(dev)`. The page is the site's
 * own (for its fonts); a tile whose capture is missing is skipped and reported, and
 * without `room` the two room tiles are left as they are. */
export async function compose(url, devs, raw, outFor, { room = true } = {}) {
  const skipped = [];
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    for (const dev of devs) {
      const [W, H] = DEVICES[dev].tile;
      const out = outFor(dev);
      mkdirSync(out, { recursive: true });
      const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
      await page.route("**/__store/**", (r) => r.fulfill({ path: join(raw, r.request().url().split("/__store/")[1]) }));
      await page.goto(url + "/support");
      await page.waitForTimeout(1200);
      const tiles = tilesFor(dev);
      // A tile that moved or left the set must not stay behind under its old number.
      // Without the room, a room tile keeps its picture and takes its new number.
      const ids = new Set(tiles.map((t) => `${t.id}.png`));
      for (const f of readdirSync(out)) {
        const name = /^\d\d-(.+)\.png$/.exec(f)?.[1];
        if (!name || ids.has(f)) continue;
        const now = tiles.find((t) => t.name === name);
        if (!room && now?.shot === "room-mid") renameSync(join(out, f), join(out, `${now.id}.png`));
        else rmSync(join(out, f));
      }
      for (const t of tiles) {
        if (!room && t.shot === "room-mid") continue;
        const needs = [t.shot, ...(t.tv ? ["tv-game-mid"] : [])].filter((n) => !existsSync(join(raw, dev, `${n}.png`)));
        if (needs.length) { skipped.push(`${dev} ${t.id}: no ${needs.join(", ")} capture`); continue; }
        await page.evaluate((h) => { document.getElementById("tile")?.remove(); document.body.insertAdjacentHTML("beforeend", h); }, html(t, dev, W, H));
        try {
          await page.evaluate(async () => {
            await Promise.all([document.fonts.load("800 40px 'Bricolage Grotesque Variable'"), document.fonts.load("500 20px 'Figtree Variable'"), document.fonts.load("800 20px 'Figtree Variable'")]);
            await Promise.all([...document.querySelectorAll("#tile img")].map((i) => i.decode()));
          });
        } catch (e) { skipped.push(`${dev} ${t.id}: ${String(e).split("\n")[0].slice(0, 160)}`); continue; }
        await page.waitForTimeout(150);
        await page.screenshot({ path: join(out, `${t.id}.png`), clip: { x: 0, y: 0, width: W, height: H } });
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return skipped;
}
