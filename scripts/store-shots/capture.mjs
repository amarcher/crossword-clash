// The screens behind the store tiles: six that need no room, and a three-player room.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { open, SHOW_DAY, RACE_DAY } from "./cap.mjs";
import { feed, stageRace, stageBoard } from "./stage.mjs";

const PRODUCTION = "https://crosswordclash.com";
const draft = JSON.parse(readFileSync(new URL("./studio-draft.json", import.meta.url), "utf8"));

/** Menu, board, stats and archive, then the race and the studio (in the tablets' tighter viewport). */
export async function captureScenes(url, dev, raw) {
  const out = join(raw, dev);
  const failed = [];
  const step = async (label, fn) => { try { await fn(); } catch (e) { failed.push(`${dev} ${label}: ${String(e).split("\n")[0].slice(0, 200)}`); } };
  const staged = async (opts = {}) => {
    const s = await open(opts.url ?? url, "plus", dev, out, opts);
    await stageRace(s.page, feed(RACE_DAY, "midi"));
    await stageBoard(s.page, { selfId: s.userId, times: [231, 248, 263, 312, 345, 402, 471, 536], selfRank: 2 });
    return s;
  };

  let s = await staged();
  await step("menu", async () => { await s.go("/menu"); await s.shot("menu"); });
  await step("board", async () => { await s.go("/daily/leaderboard/midi"); await s.shot("board"); });
  await step("stats", async () => { await s.go("/stats"); await s.page.evaluate(() => window.scrollTo(0, 0)); await s.page.waitForTimeout(300); await s.shot("stats"); });
  await step("archive", async () => { await s.go("/archive"); await s.shot("archive"); });
  await s.close();

  s = await staged({ tight: true });
  await step("race", async () => {
    await s.go(`/daily/leaderboard/midi?day=${RACE_DAY}`);
    await s.tap(s.page.getByTestId("the-race").last());
    await s.page.waitForTimeout(800);
    await s.page.getByRole("slider", { name: "Race clock" }).fill("165000");
    await s.rename("shots_plus", "archer");
    await s.page.waitForTimeout(300);
    await s.shot("race");
  });
  await s.close();

  // The studio needs its word list, which a fresh checkout has not built
  // (pnpm seedgrid:studio-dict); without it the live site's studio is captured.
  const local = existsSync("public/seedgrid/words.dict");
  const init = `localStorage.setItem("crossword-clash:studio", ${JSON.stringify(JSON.stringify({ ...draft, cursor: 54, dir: "across" }))})`;
  s = await staged({ tight: true, init, url: local ? url : PRODUCTION });
  await step("studio", async () => {
    await s.go("/studio", 7000);
    await s.rename("shots-plus@", "maya", true);
    await s.page.waitForTimeout(300);
    await s.shot("studio");
  });
  await s.close();
  return { failed, studioFrom: local ? "this checkout" : PRODUCTION };
}

/** A real room on the showcase day's large, hosted on a TV and played by three test
 * players, captured a little past halfway. Up to three devices share one room; empty
 * seats are filled by phones. Each run leaves one finished test room on production. */
export async function captureRoom(url, devs, raw) {
  if (devs.length > 3) throw new Error("A room seats three capture devices.");
  const p = feed(SHOW_DAY, "large");
  const tv = await open(url, "anon", "tv", join(raw, "tv"));
  await tv.go("/host");
  await tv.page.getByRole("button", { name: `Host ${p.title} on TV` }).click();
  await tv.page.waitForTimeout(3500);
  const code = (await tv.page.getByTestId("room-code").textContent()).trim();

  const seats = [["plus", "Maya"], ["free", "Theo"], ["anon", "Priya"]];
  const players = [];
  for (const [i, [as, name]] of seats.entries()) {
    const dev = devs[i] ?? "iphone";
    const s = await open(url, as, dev, join(raw, devs[i] ? dev : "filler"));
    await s.go("/join");
    const inputs = s.page.locator("input:visible");
    await inputs.nth(0).fill(code);
    await inputs.nth(1).fill(name);
    await s.tap(s.page.getByRole("button", { name: "Join room" }));
    await s.page.waitForTimeout(2500);
    players.push({ s, dev: devs[i] });
  }
  await tv.page.getByText("Priya").first().waitFor({ timeout: 15000 });
  await tv.page.getByRole("button", { name: "Start game" }).click();
  await tv.page.waitForTimeout(4000);

  // Who takes which square: three territories with ragged borders.
  const { W, grid } = p;
  const owner = (i) => { const x = i % W, y = Math.floor(i / W); const k = x + ((y * 7) % 5) - 2; return k < 5 ? 0 : k < 10 ? 1 : 2; };
  const white = [...grid.keys()].filter((i) => grid[i] !== ".");
  const nth = new Map(white.map((i, n) => [i, n]));
  const queues = [0, 1, 2].map((o) => white.filter((i) => owner(i) === o));
  const cells = (s) => s.page.locator('[role="gridcell"]:not([aria-hidden])');
  const type = async ({ s }, i) => {
    await s.tap(cells(s).nth(nth.get(i)));
    await s.tap(s.page.getByRole("button", { name: grid[i], exact: true }).first());
  };
  const mid = Math.floor(white.length * 0.56);
  const speed = [3, 2, 2];
  let done = 0;
  while (queues.some((q) => q.length)) {
    for (let o = 0; o < 3; o++) for (let k = 0; k < speed[o]; k++) {
      const i = queues[o].shift();
      if (i === undefined) continue;
      await type(players[o], i);
      if (++done !== mid) continue;
      await tv.page.waitForTimeout(1200);
      for (const { s, dev } of players) {
        if (!dev) continue;
        // 1 Across in the clue bar, whatever each player typed last.
        await s.tap(cells(s).nth(0));
        const down = s.page.getByRole("button", { name: /^Direction: Down/ });
        if (await down.count()) await s.tap(down.first());
        await s.page.waitForTimeout(400);
        await s.shot("room-mid");
      }
      await tv.shot("game-mid");
      for (const { dev } of players) if (dev) copyFileSync(join(raw, "tv", "game-mid.png"), join(raw, dev, "tv-game-mid.png"));
    }
  }
  // Played to the end, so the room is left finished rather than open.
  await tv.page.waitForTimeout(3000);
  for (const { s } of players) await s.close();
  await tv.close();
  return code;
}
