// Store captures: the web app in native mode at a store device's exact pixel size,
// signed in as a test account, with the app's clock pinned to the showcase day.
import { readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

/** The day whose dailies the tiles show, and the day before it for The race. Their
 * puzzles carry no third-party names in a title or a clue on screen; check a new
 * day's before changing them (store art must not show another company's trademark). */
export const SHOW_DAY = process.env.STORE_SHOTS_DAY ?? "2026-11-16";
export const RACE_DAY = process.env.STORE_SHOTS_RACE_DAY ?? "2026-11-15";

/** Each store set: the capture viewport, the tile's pixel size and the folder it is kept in.
 * `tight` is a smaller viewport for the screens that read too small on a tablet tile. */
export const DEVICES = {
  iphone: { w: 440, h: 956, dpr: 3, platform: "ios", tile: [1320, 2868], out: "docs/app-store/screenshots/iphone-6.9" },
  ipad: { w: 1032, h: 1376, dpr: 2, platform: "ios", tight: { w: 688, h: 918, dpr: 3 }, tile: [2064, 2752], out: "docs/app-store/screenshots/ipad-13" },
  duoOuter: { w: 466, h: 678, dpr: 3, platform: "ios", tile: [1398, 2034], out: "docs/app-store/screenshots/iphone-duo-outer" },
  duoInner: { w: 669, h: 951, dpr: 3, platform: "ios", tile: [2007, 2853], out: "docs/app-store/screenshots/iphone-duo-inner" },
  android: { w: 412, h: 915, dpr: 2.625, platform: "android", tile: [1080, 2160], out: "docs/play-store/screenshots/phone" },
  tablet: { w: 800, h: 1280, dpr: 2, platform: "android", tight: { w: 640, h: 1024, dpr: 2.5 }, tile: [1600, 2560], out: "docs/play-store/screenshots/tablet-10" },
  tv: { w: 1280, h: 720, dpr: 2, platform: null },
};

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];

async function signIn(as) {
  const accounts = JSON.parse(readFileSync(join(homedir(), ".config/crossword-clash/shots-accounts.json"), "utf8"));
  const account = accounts[as];
  if (!account) throw new Error(`No "${as}" account; use free, plus or anon.`);
  const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  if (!res.ok) throw new Error(`Sign-in as ${as} failed: HTTP ${res.status}`);
  return res.json();
}

/** Opens the app at `url` on a device as `as` ("plus", "free" or "anon"). */
export async function open(url, as, device, out, opts = {}) {
  const base = DEVICES[device];
  const d = { ...base, ...(opts.tight ? base.tight : {}) };
  const touch = d.platform !== null;
  const auth = as === "anon" ? null : await signIn(as);
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: d.dpr,
    hasTouch: touch,
    isMobile: touch && d.w < 700,
  });
  if (auth) await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify(auth)]);
  if (d.platform) await context.addInitScript((name) => { window.CapacitorCustomPlatform = { name }; }, d.platform);
  if (opts.init) await context.addInitScript(opts.init);
  // The clock keeps running from here, so timers and the room's realtime channel work.
  await context.clock.install({ time: new Date(`${SHOW_DAY}T10:30:00`) });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  const shot = async (name) => { await page.screenshot({ path: join(out, `${name}.png`) }); };
  const go = async (path, wait = 2200) => { await page.goto(url + path); await page.waitForTimeout(wait); };
  const tap = async (loc) => (touch ? loc.tap() : loc.click());
  /** Swaps a test account's name on screen for an invented one; `whole` replaces the
   * text it is part of (an email address), not only the match. */
  const rename = (from, to, whole = false) => page.evaluate(([from, to, whole]) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode()); ) if (n.nodeValue.includes(from)) n.nodeValue = whole ? to : n.nodeValue.replace(from, to);
  }, [from, to, whole]);
  return { page, shot, go, tap, rename, errors, userId: auth?.user?.id, close: () => browser.close() };
}
