// Staged, invented data for store captures: believable names, synthetic solves.
// From docs/marketing/scripts/stage.mjs (kept there as it ran for the 1.1.3 reel).
import { readFileSync } from "node:fs";
export const NAMES = ["maya", "theo", "priya", "jules", "nora", "leo", "ines", "sam", "ben", "ruth", "omar", "kit"];
export function feed(day, slot) {
  const p = JSON.parse(readFileSync(`public/daily-puzzles/${slot === "mini" ? "" : slot + "/"}${day}.json`, "utf8")).puzzle;
  return { ...p, W: p.size.cols, H: p.size.rows };
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** A believable solve: clue by clue, across-heavy, with thinking pauses; scaled to `seconds`. */
export function synthSolve(p, seed, seconds) {
  const r = rng(seed); const { W, H, grid } = p;
  const words = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (grid[y * W + x] === ".") continue;
    if ((x === 0 || grid[y * W + x - 1] === ".") && x + 1 < W && grid[y * W + x + 1] !== ".") { const c = []; for (let k = x; k < W && grid[y * W + k] !== "."; k++) c.push(y * W + k); words.push(c); }
    if ((y === 0 || grid[(y - 1) * W + x] === ".") && y + 1 < H && grid[(y + 1) * W + x] !== ".") { const c = []; for (let k = y; k < H && grid[k * W + x] !== "."; k++) c.push(k * W + x); words.push(c); }
  }
  // Mostly in order, with local shuffles: a solver works a corner, then moves on.
  // Each solver starts in their own corner and works outwards, with detours.
  const ax = r() * W, ay = r() * H;
  const order = words.map((w) => { const c = w[Math.floor(w.length / 2)]; return { w, k: Math.hypot((c % W) - ax, Math.floor(c / W) - ay) + r() * 3.5 }; }).sort((a, b) => a.k - b.k).map((o) => o.w);
  const done = new Set(); const ev = []; let t = 1500 + r() * 2500;
  for (const w of order) {
    const todo = w.filter((c) => !done.has(c)); if (!todo.length) continue;
    t += 900 + r() * 5200;
    for (const c of todo) { t += 260 + r() * 520; ev.push([t, c, grid[c]]); done.add(c); }
  }
  for (let c = 0; c < grid.length; c++) if (grid[c] !== "." && !done.has(c)) { t += 600; ev.push([t, c, grid[c]]); }
  const k = (seconds * 1000 - 200) / ev[ev.length - 1][0];
  return { seconds, events: ev.map(([ms, c, l]) => [Math.round(ms * k), c, l]) };
}
export const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** Route mocks for The race among invented friends on a puzzle. */
export async function stageRace(page, p, { own = 248, friends = [["maya", 231], ["theo", 263], ["priya", 312]] } = {}) {
  const fr = friends.map(([username, seconds], i) => ({ user_id: uid(i + 1), username, ...synthSolve(p, 23 + i * 101, seconds) }));
  const mine = synthSolve(p, 977, own);
  await page.route("**/rest/v1/rpc/race_candidates", (r) => r.fulfill({ json: fr.map((f) => ({ user_id: f.user_id, username: f.username, seconds: f.seconds, friend: true })) }));
  await page.route("**/rest/v1/rpc/friend_race", (r) => r.fulfill({ json: fr.map((f) => ({ ...f, with_letters: true })) }));
  await page.route("**/rest/v1/solve_traces*", (r) => r.fulfill({ json: mine }));
  // Racing a finished solve asks for one recording at a time, without its letters.
  await page.route("**/rest/v1/rpc/solve_trace", (r) => {
    const f = fr.find((x) => x.user_id === r.request().postDataJSON().p_user);
    return r.fulfill({ json: f ? [{ seconds: f.seconds, events: f.events.map(([ms, c]) => [ms, c, "1"]), with_letters: false }] : [] });
  });
  return { fr, mine };
}
/** Rewrite the daily board with invented names and times; `selfId` gets `selfName` at rank `selfRank`. */
export async function stageBoard(page, { selfId, selfName = "archer", times, selfRank = 2, modes = [] }) {
  await page.route("**/rest/v1/daily_results*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.fallback();
    const res = await route.fetch(); let rows;
    try { rows = await res.json(); } catch { return route.fulfill({ response: res }); }
    if (!Array.isArray(rows) || rows.length === 0 || !("display_name" in rows[0])) return route.fulfill({ response: res });
    const t = rows[0]; let n = 0;
    const out = times.map((seconds, i) => i === selfRank - 1
      ? { ...t, id: uid(900), user_id: selfId, display_name: selfName, seconds, mode: "solo" }
      : { ...t, id: uid(100 + i), user_id: uid(100 + i), display_name: NAMES[n++ % NAMES.length], seconds, mode: modes[i] ?? "solo" });
    await route.fulfill({ status: 200, headers: res.headers(), json: out });
  });
}
/** Invented community puzzles for the browse page: titles and authors only, in the
 * shape of the list's own rows (the first real row is the template). */
export const COMMUNITY = [
  ["Garden Party", "maya", 5, 10, "easy", 212, 164],
  ["Road Trip Snacks", "theo", 9, 30, "medium", 148, 87],
  ["Night Owls", "priya", 15, 76, "hard", 96, 31],
  ["Rainy Day Mini", "jules", 5, 10, "easy", 301, 255],
  ["Bake Sale", "nora", 7, 18, "medium", 77, 52],
  ["Camping Trip", "leo", 9, 32, "medium", 64, 40],
];
export async function stageCommunity(page) {
  await page.route("**/rest/v1/community_puzzles*", async (route) => {
    const res = await route.fetch(); let rows;
    try { rows = await res.json(); } catch { return route.fulfill({ response: res }); }
    if (!Array.isArray(rows) || rows.length === 0 || !("short_id" in rows[0])) return route.fulfill({ response: res });
    const out = COMMUNITY.map(([title, author, side, clue_count, difficulty, plays, solves], i) => ({
      ...rows[0], id: uid(500 + i), short_id: `store${String(i).padStart(3, "0")}`, author_id: uid(500 + i), author, studio_id: `store-${i}`,
      title, notes: null, difficulty, lang: "en", width: side, height: side, clue_count, puzzle_key: `store:${i}`, plays, solves,
    }));
    await route.fulfill({ status: 200, headers: res.headers(), json: out });
  });
}
