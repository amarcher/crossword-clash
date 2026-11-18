// Store captures: the web app in native mode at a store device's exact pixel size.
import { readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/");
const { chromium } = require("@playwright/test");
export const url = process.env.DRIVE_URL || "http://localhost:5311";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
export const DEVICES = {
  iphone: { w: 440, h: 956, dpr: 3, platform: "ios", touch: true },       // 1320×2868
  ipad: { w: 1032, h: 1376, dpr: 2, platform: "ios", touch: true },        // 2064×2752
  android: { w: 412, h: 915, dpr: 2.625, platform: "android", touch: true },
  tablet: { w: 800, h: 1280, dpr: 2, platform: "android", touch: true },
  tv: { w: 1280, h: 720, dpr: 2, platform: null, touch: false },
};
export async function signIn(as) {
  const a = JSON.parse(readFileSync(join(homedir(), ".config/crossword-clash/shots-accounts.json"), "utf8"))[as];
  const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }) });
  if (!res.ok) throw new Error("sign-in failed " + res.status);
  return res.json();
}
export async function open(as, device, out, opts = {}) {
  const d = { ...DEVICES[device], ...opts };
  const auth = as === "anon" ? null : await signIn(as);
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr, hasTouch: d.touch, isMobile: d.touch && d.w < 700, permissions: ["clipboard-read", "clipboard-write"], reducedMotion: opts.reducedMotion ?? "no-preference" });
  if (auth) await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify(auth)]);
  if (d.platform) await context.addInitScript((name) => { window.CapacitorCustomPlatform = { name }; }, d.platform);
  if (opts.init) await context.addInitScript(opts.init);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 160)));
  const shot = async (name) => { const f = join(out, `${name}.png`); await page.screenshot({ path: f }); console.log(f); return f; };
  const go = async (path, wait = 2200) => { await page.goto(url + path); await page.waitForTimeout(wait); };
  const tap = async (loc) => (d.touch ? loc.tap() : loc.click());
  return { page, context, shot, go, tap, errors, auth, userId: auth?.user?.id, close: () => browser.close(), d };
}
