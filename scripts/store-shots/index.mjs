#!/usr/bin/env node
// Regenerates the store screenshot sets from the app as it is in this checkout:
//   pnpm store:shots                      every set
//   pnpm store:shots duoOuter,duoInner    only those sets
//   pnpm store:shots --out /tmp/tiles     write the tiles elsewhere (a dry run for the docs folders)
//   pnpm store:shots --no-room            skip the room (its two tiles are then left as they are)
//   pnpm store:shots --url http://localhost:5173   use a dev server that is already running
//
// Sets: iphone, ipad, duoOuter, duoInner (docs/app-store/screenshots) and android,
// tablet (docs/play-store/screenshots). Needs .env.local and the test accounts in
// ~/.config/crossword-clash/shots-accounts.json (see scripts/shots.mjs). The room
// tiles play a real three-player room on production with those accounts: one
// finished test room per two sets. Nothing is uploaded to either store.
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { DEVICES, SHOW_DAY } from "./cap.mjs";
import { captureScenes, captureRoom } from "./capture.mjs";
import { compose } from "./compose.mjs";

const sets = Object.keys(DEVICES).filter((d) => DEVICES[d].out);
const usage = (message) => { console.error(`${message}\nUsage: pnpm store:shots [${sets.join(",")}] [--out <dir>] [--url <dev server>] [--no-room]`); process.exit(1); };

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  const [, v] = args.splice(i, 2);
  if (!v || v.startsWith("--")) usage(`--${name} needs a value.`);
  return v;
};
const outRoot = value("out");
let url = value("url")?.replace(/\/+$/, "") ?? null;
const noRoom = args.indexOf("--no-room");
if (noRoom !== -1) args.splice(noRoom, 1);
const room = noRoom === -1;
if (args.length > 1) usage(`One comma-separated list of sets, not "${args.join(" ")}".`);
const devs = args[0] ? [...new Set(args[0].split(","))] : sets;
const unknown = devs.filter((d) => !sets.includes(d));
if (unknown.length) usage(`Unknown set or option: ${unknown.join(", ")}.`);

const raw = resolve("artifacts/store-shots/raw");
let server = null;
if (!url) {
  const port = 5300 + Math.floor(Math.random() * 400);
  server = spawn("node_modules/.bin/vite", ["--port", String(port), "--strictPort"], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } });
  await new Promise((ready, fail) => {
    server.stdout.on("data", (d) => /Local:/.test(String(d)) && ready());
    server.on("exit", () => fail(new Error("The dev server did not start.")));
    setTimeout(() => fail(new Error("The dev server did not answer within 60 seconds.")), 60_000).unref();
  }).catch((e) => { server.kill(); console.error(e.message); process.exit(1); });
  url = `http://localhost:${port}`;
}

// Each room seats one set as the Plus account and one as the free account.
const rooms = [];
for (const dev of devs) {
  const seat = DEVICES[dev].seat;
  const free = rooms.find((r) => !r[seat]);
  if (free) free[seat] = dev; else rooms.push({ [seat]: dev });
}

const problems = [];
try {
  console.log(`Showcase day ${SHOW_DAY}, app at ${url}`);
  for (const dev of devs) {
    const { failed, studioFrom } = await captureScenes(url, dev, raw);
    problems.push(...failed);
    console.log(`${dev}: screens captured (studio from ${studioFrom})`);
  }
  if (room) for (const seats of rooms) {
    const who = [seats.plus, seats.free].filter(Boolean).join(", ");
    try { console.log(`${who}: room ${await captureRoom(url, seats, raw)} played`); }
    catch (e) { problems.push(`room for ${who}: ${String(e).split("\n")[0].slice(0, 200)}`); }
  }
  const outFor = (dev) => (outRoot ? join(resolve(outRoot), dev) : resolve(DEVICES[dev].out));
  problems.push(...(await compose(url, devs, raw, outFor, { room })));
  if (!room) console.log("Room skipped: the two room tiles were not rewritten.");
  for (const dev of devs) console.log(`${dev}: ${outFor(dev)}`);
} finally {
  server?.kill();
}
if (problems.length) { console.error(`\nNot everything was captured:\n  ${problems.join("\n  ")}`); process.exit(1); }
