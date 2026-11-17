import { open } from "./cap.mjs";
import { feed } from "./stage.mjs";
const dump = async (s, label) => { console.log("==", label, s.page.url()); console.log((await s.page.locator("button:visible, h1:visible, h2:visible, input:visible").evaluateAll((els) => els.map((e) => e.tagName[0] + ":" + (e.getAttribute("aria-label") || e.textContent || e.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 40)))).join(" | ").slice(0, 900)); };
const step = async (label, fn) => { try { await fn(); } catch (e) { console.log("FAILED", label, String(e).split("\n")[0].slice(0, 220)); } };
const host = process.env.AI_HOST === "1";
const PACE = Number(process.env.PACE ?? 0);
const p = feed("2026-11-16", "large");
const tv = await open("anon", "tv", process.env.ST + "/raw/tv");
await tv.go("/host");
await tv.page.getByRole("button", { name: "Host Garage Band on TV" }).click(); await tv.page.waitForTimeout(3500);
const code = (await tv.page.getByTestId("room-code").textContent()).trim();
console.log("room", code, tv.page.url());
const players = [];
for (const [as, name] of [["plus", "Maya"], ["free", "Theo"], ["anon", "Priya"]]) {
  const s = await open(as, "iphone", process.env.ST + "/raw/iphone");
  await s.go("/join");
  const inputs = s.page.locator("input:visible");
  await inputs.nth(0).fill(code); await inputs.nth(1).fill(name);
  await s.tap(s.page.getByRole("button", { name: "Join room" })); await s.page.waitForTimeout(2500);
  players.push({ s, name });
}
await tv.page.getByText("Priya").first().waitFor({ timeout: 15000 }).catch(() => console.log("no Priya on tv"));
await tv.page.waitForTimeout(800);
await tv.shot("lobby"); await players[0].s.shot("room-lobby"); await dump(players[0].s, "p1 lobby");
if (host) await step("ai host on", async () => { await tv.page.getByRole("button", { name: "On", exact: true }).click({ timeout: 8000 }); await tv.page.waitForTimeout(500); await tv.shot("lobby-host-on"); });
await tv.page.getByRole("button", { name: "Start game" }).click(); await tv.page.waitForTimeout(4000);
await dump(players[0].s, "p1 play");
// Who takes which square: three territories with ragged borders, typed word by word.
const { W, grid } = p; const owner = (i) => { const x = i % W, y = Math.floor(i / W); const k = x + ((y * 7) % 5) - 2; return k < 5 ? 0 : k < 10 ? 1 : 2; };
const white = [...grid.keys()].filter((i) => grid[i] !== ".");
const nth = new Map(white.map((i, n) => [i, n]));
const queues = [0, 1, 2].map((o) => white.filter((i) => owner(i) === o));
const typeCell = async (pl, i) => {
  const cells = pl.s.page.locator('[role="gridcell"]:not([aria-hidden])');
  await pl.s.tap(cells.nth(nth.get(i)));
  await pl.s.tap(pl.s.page.getByRole("button", { name: grid[i], exact: true }).first());
};
const total = white.length; let done = 0; const marks = { mid: Math.floor(total * 0.56) }; let midDone = false;
const speed = [3, 2, 2];
outer: while (done < total) {
  for (let o = 0; o < 3; o++) for (let k = 0; k < speed[o]; k++) {
    const i = queues[o].shift(); if (i === undefined) continue;
    const t0 = Date.now();
    await step("type " + i, () => typeCell(players[o], i)); done++;
    if (process.env.FRAMES === "1") {
      await tv.page.waitForTimeout(250);
      await tv.page.screenshot({ path: process.env.ST + "/frames/tv/" + String(done).padStart(4, "0") + ".jpg", type: "jpeg", quality: 92 });
      await players[0].s.page.screenshot({ path: process.env.ST + "/frames/phone/" + String(done).padStart(4, "0") + ".jpg", type: "jpeg", quality: 92 });
    }
    const left = PACE - (Date.now() - t0); if (left > 0) await tv.page.waitForTimeout(left);
    if (!midDone && done >= marks.mid) {
      midDone = true; await tv.page.waitForTimeout(1200);
      await tv.shot("game-mid"); await players[0].s.shot("room-mid"); await players[1].s.shot("room-mid-p2");
    }
    if (done === total - 1) { await tv.page.waitForTimeout(800); }
  }
  if (queues.every((q) => q.length === 0)) break outer;
}
await tv.page.waitForTimeout(4500);
await tv.shot("finish"); await players[0].s.shot("room-finish"); await dump(tv, "tv finish"); await dump(players[0].s, "p1 finish");
await step("tv replay", async () => {
  await tv.page.getByRole("button", { name: "Watch the replay" }).click(); await tv.page.waitForTimeout(2500); await tv.shot("replay");
});
await step("phone finish scroll", async () => { const d = players[0].s.page.getByRole("dialog"); await d.evaluate((el) => el.querySelector("[class*=overflow-y]")?.scrollTo(0, 600)); await players[0].s.page.waitForTimeout(600); await players[0].s.shot("room-finish-2"); });
console.log("tv errors", tv.errors.slice(0, 5)); console.log("p1 errors", players[0].s.errors.slice(0, 5));
console.log("banner:", await tv.page.locator("button.tv-t-md").allTextContents());
for (const pl of players) await pl.s.close();
await tv.close();
