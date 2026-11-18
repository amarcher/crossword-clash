// Race on the puzzle made in the studio: host from the play-test page, two friends join.
import { open } from "./cap.mjs";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
const ST = process.env.ST;
const draft = readFileSync(ST + "/studio/draft-clued.json", "utf8");
const dump = async (s, label) => { console.log("==", label, s.page.url()); console.log((await s.page.locator("button:visible, h1:visible, h2:visible, input:visible").evaluateAll((els) => els.map((e) => e.tagName[0] + ":" + (e.getAttribute("aria-label") || e.textContent || e.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 40)))).join(" | ").slice(0, 900)); };
const h = await open("plus", "iphone", ST + "/studio", { init: `localStorage.setItem("crossword-clash:studio", ${JSON.stringify(draft)})` });
const p = h.page;
await h.go("/studio", 7000);
await h.tap(p.locator('nav [role="tab"]').filter({ hasText: "More" })); await p.waitForTimeout(500);
await h.tap(p.getByRole("button", { name: "Play test" }).first()); await p.waitForTimeout(4000);
await h.shot("race-0-landing");
await h.tap(p.getByText("Start a room", { exact: true })); await p.waitForTimeout(3500);
await h.shot("race-1-after-start"); await dump(h, "host after start");
if (process.env.STOP === "1") { await h.close(); process.exit(0); }
const step = async (label, fn) => { try { await fn(); } catch (e) { console.log("FAILED", label, String(e).split("\n")[0].slice(0, 220)); } };
await p.locator("input:visible").first().fill("Maya");
await h.tap(p.getByRole("button", { name: "Create room" })); await p.waitForTimeout(4000);
await dump(h, "host lobby");
const code = ((await p.getByTestId("room-code").textContent().catch(() => null)) || (await p.evaluate(() => (document.body.innerText.match(/\b[A-Z0-9]{6}\b/) || [""])[0]))).trim();
console.log("room", code);
const players = [{ s: h, name: "Maya" }];
for (const [as, name] of [["free", "Theo"], ["anon", "Priya"]]) {
  const s = await open(as, "iphone", ST + "/studio");
  await s.go("/join");
  const inputs = s.page.locator("input:visible");
  await inputs.nth(0).fill(code); await inputs.nth(1).fill(name);
  await s.tap(s.page.getByRole("button", { name: "Join room" })); await s.page.waitForTimeout(2500);
  players.push({ s, name });
}
await p.getByText("Priya").first().waitFor({ timeout: 15000 }).catch(() => console.log("no Priya on host"));
await p.waitForTimeout(800); await h.shot("race-2-lobby"); await dump(h, "host lobby full");
await h.tap(p.getByRole("button", { name: /Start game/ })); await p.waitForTimeout(4500);
await dump(h, "host play"); await h.shot("race-3-start");
const g = JSON.parse(draft).grid, W = g.width, grid = g.cells;
const owner = (i) => { const x = i % W, y = Math.floor(i / W); const k = x + ((y * 7) % 5) - 2; return k < 3 ? 0 : k < 6 ? 1 : 2; };
const white = [...grid.keys()].filter((i) => grid[i] !== "#");
const nth = new Map(white.map((i, n) => [i, n]));
const queues = [0, 1, 2].map((o) => white.filter((i) => owner(i) === o));
console.log("queues", queues.map((q) => q.length));
const typeCell = async (pl, i) => {
  const cells = pl.s.page.locator('[role="gridcell"]:not([aria-hidden])');
  await pl.s.tap(cells.nth(nth.get(i)));
  await pl.s.tap(pl.s.page.getByRole("button", { name: grid[i], exact: true }).first());
};
const dir = ST + "/frames/st-race"; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
let n = 0; const frame = async () => { n++; await p.screenshot({ path: `${dir}/${String(n).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 }); };
await frame(); await frame();
const total = white.length; let done = 0; const speed = [2, 2, 2];
outer: while (done < total) {
  for (let o = 0; o < 3; o++) for (let k = 0; k < speed[o]; k++) {
    const i = queues[o].shift(); if (i === undefined) continue;
    if (done === total - 1) { await p.waitForTimeout(500); }
    await step("type " + i, () => typeCell(players[o], i)); done++;
    await p.waitForTimeout(220); await frame();
  }
  if (queues.every((q) => q.length === 0)) break outer;
}
for (let k = 0; k < 10; k++) { await p.waitForTimeout(500); await frame(); }
await h.shot("race-4-finish"); await dump(h, "host finish");
console.log("frames", n, "errors", h.errors.slice(0, 5));
for (const pl of players) await pl.s.close();
