// The screens behind the store tiles: six that need no room, and a three-player room.
import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { open, SHOW_DAY, RACE_DAY } from "./cap.mjs";
import { feed, stageRace, stageBoard } from "./stage.mjs";

const PRODUCTION = "https://crosswordclash.com";
const draft = JSON.parse(readFileSync(new URL("./studio-draft.json", import.meta.url), "utf8"));
const brief = (e) => String(e).split("\n")[0].slice(0, 200);

/** The Plus test account under the name the staged board gives it, so its row, its
 * avatar and its marker in the race all agree. */
async function asArcher(page) {
  await page.route("**/rest/v1/profiles*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replaceAll("shots_plus", "archer") });
  });
}

/** Menu, board, stats and archive, then the race and the studio (in the tablets' tighter viewport). */
export async function captureScenes(url, dev, raw) {
  const out = join(raw, dev);
  // A failed step must leave no older capture behind for the composer to pick up.
  rmSync(out, { recursive: true, force: true });
  const failed = [];
  const session = async (opts, steps) => {
    const s = await open(opts.url ?? url, "plus", dev, out, opts);
    try {
      await asArcher(s.page);
      await stageRace(s.page, feed(RACE_DAY, "midi"));
      await stageBoard(s.page, { selfId: s.userId, times: [231, 248, 263, 312, 345, 402, 471, 536], selfRank: 2 });
      for (const [label, fn] of steps) {
        try { await fn(s); } catch (e) { failed.push(`${dev} ${label}: ${brief(e)}`); }
      }
    } finally {
      await s.close();
    }
  };

  await session({}, [
    ["menu", async (s) => { await s.go("/menu"); await s.shot("menu"); }],
    ["board", async (s) => { await s.go("/daily/leaderboard/midi"); await s.shot("board"); }],
    ["stats", async (s) => { await s.go("/stats"); await s.page.evaluate(() => window.scrollTo(0, 0)); await s.page.waitForTimeout(300); await s.shot("stats"); }],
    ["archive", async (s) => { await s.go("/archive"); await s.shot("archive"); }],
  ]);

  await session({ tight: true }, [
    ["race", async (s) => {
      await s.go(`/daily/leaderboard/midi?day=${RACE_DAY}`);
      await s.tap(s.page.getByTestId("the-race").last());
      await s.page.waitForTimeout(800);
      await s.page.getByRole("slider", { name: "Race clock" }).fill("165000");
      await s.page.waitForTimeout(300);
      await s.shot("race");
    }],
  ]);

  // The studio needs its word list, which a fresh checkout has not built
  // (pnpm seedgrid:studio-dict); without it the live site's studio is captured.
  const local = existsSync("public/seedgrid/words.dict");
  const init = `localStorage.setItem("crossword-clash:studio", ${JSON.stringify(JSON.stringify({ ...draft, cursor: 54, dir: "across" }))})`;
  await session({ tight: true, init, url: local ? url : PRODUCTION }, [
    ["studio", async (s) => {
      await s.go("/studio", 7000);
      await s.rename("shots-plus@", "maya", true);
      await s.page.waitForTimeout(300);
      await s.shot("studio");
    }],
  ]);
  return { failed, studioFrom: local ? "this checkout" : PRODUCTION };
}

/** A real room on the showcase day's large, hosted on a TV and played by three test
 * players, captured a little past halfway. `seats` names the set that plays as the
 * Plus account and the one that plays as the free account (either may be missing);
 * phones fill the empty seats. Each run leaves one finished test room on production;
 * a run that fails closes its room instead. */
export async function captureRoom(url, seats, raw) {
  const p = feed(SHOW_DAY, "large");
  const cast = [["plus", "Maya", seats.plus], ["free", "Theo", seats.free], ["anon", "Priya", undefined]];
  for (const [, , dev] of cast) if (dev) for (const f of ["room-mid", "tv-game-mid"]) rmSync(join(raw, dev, `${f}.png`), { force: true });
  const sessions = [];
  let tv = null;
  let finished = false;
  try {
    tv = await open(url, "anon", "tv", join(raw, "tv"));
    sessions.push(tv);
    await tv.go("/host");
    await tv.page.getByRole("button", { name: `Host ${p.title} on TV` }).click();
    await tv.page.waitForTimeout(3500);
    const code = (await tv.page.getByTestId("room-code").textContent()).trim();

    const players = [];
    for (const [as, name, dev] of cast) {
      const s = await open(url, as, dev ?? "iphone", join(raw, dev ?? "filler"));
      sessions.push(s);
      await s.go("/join");
      const inputs = s.page.locator("input:visible");
      await inputs.nth(0).fill(code);
      await inputs.nth(1).fill(name);
      await s.tap(s.page.getByRole("button", { name: "Join room" }));
      await s.page.waitForTimeout(2500);
      players.push({ s, dev });
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
      const press = async () => {
        await s.tap(cells(s).nth(nth.get(i)));
        await s.tap(s.page.getByRole("button", { name: grid[i], exact: true }).first());
      };
      // One missed tap in a few hundred must not cost the room.
      try { await press(); } catch { await s.page.waitForTimeout(500); await press(); }
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
    // The finisher's last claim has to land before the room is marked completed.
    await tv.page.getByText("Puzzle complete").first().waitFor({ timeout: 15000 });
    await tv.page.waitForTimeout(1500);
    finished = true;
    return code;
  } finally {
    if (tv && !finished) await closeRoom(tv).catch(() => {});
    for (const s of sessions) await s.close().catch(() => {});
  }
}

/** Best effort: the host's Close Room, and its confirmation in either form. */
async function closeRoom(tv) {
  tv.page.on("dialog", (d) => d.accept());
  const close = tv.page.getByRole("button", { name: /Close Room/i }).first();
  if (!(await close.count())) return;
  await close.click({ timeout: 3000 });
  const confirm = tv.page.getByRole("dialog").getByRole("button", { name: /Close/i }).first();
  if (await confirm.count()) await confirm.click({ timeout: 3000 });
  await tv.page.waitForTimeout(1500);
}
