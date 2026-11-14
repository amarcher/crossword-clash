#!/usr/bin/env node
// Screenshots of the running app as a signed-in test account, so a change can be
// looked at in the state it is for: `pnpm shots /stats /archive --as plus --width 390,1280`.
//
// Accounts: `shots_free` and `shots_plus` (a hand-granted Plus entitlement, no billing),
// email-and-password users in the production project, hidden from username lookups
// (profiles.hidden). Their passwords live outside the repo in
// ~/.config/crossword-clash/shots-accounts.json. `--as anon` signs nobody in.
// The script starts its own dev server unless `--url` names one; local dev posts
// nothing to the daily boards (boardPostsHere), so these accounts never rank there.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args.splice(i, 2)[1];
};
const as = flag("as", "free");
const widths = flag("width", "390").split(",").map(Number);
const out = resolve(flag("out", "artifacts/shots"));
const wait = Number(flag("wait", "2500"));
const click = flag("click", null); // an accessible name to click before the shot, e.g. --click "About Plus"
let url = flag("url", null);
const routes = args.length ? args : ["/menu"];

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const supabaseUrl = env.VITE_SUPABASE_URL;
const ref = new URL(supabaseUrl).hostname.split(".")[0];

async function session() {
  if (as === "anon") return null;
  const accounts = JSON.parse(readFileSync(join(homedir(), ".config/crossword-clash/shots-accounts.json"), "utf8"));
  const account = accounts[as];
  if (!account) throw new Error(`No "${as}" account; use free, plus or anon.`);
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  if (!res.ok) throw new Error(`Sign-in as ${as} failed: HTTP ${res.status}`);
  return res.json();
}

let server = null;
if (!url) {
  const port = 5300 + Math.floor(Math.random() * 400);
  server = spawn("node_modules/.bin/vite", ["--port", String(port), "--strictPort"], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((ready, fail) => {
    server.stdout.on("data", (d) => String(d).includes("Local:") && ready());
    server.on("exit", () => fail(new Error("The dev server did not start.")));
  });
  url = `http://localhost:${port}`;
}

try {
  const auth = await session();
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, deviceScaleFactor: 2 });
    if (auth) {
      await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [`sb-${ref}-auth-token`, JSON.stringify(auth)]);
    }
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(url + route);
      await page.waitForTimeout(wait);
      if (click) {
        await page.getByRole("button", { name: click }).first().click();
        await page.waitForTimeout(800);
      }
      const file = join(out, `${as}-${width}-${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home"}${click ? "-clicked" : ""}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
    }
    await context.close();
  }
  await browser.close();
} finally {
  server?.kill();
}
