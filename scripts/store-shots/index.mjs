#!/usr/bin/env node
// Regenerates the store screenshot sets from the app as it is in this checkout:
//   pnpm store:shots                      every set
//   pnpm store:shots duoOuter,duoInner    only those sets
//   pnpm store:shots --out /tmp/tiles     write the tiles elsewhere (a dry run for the docs folders)
//   pnpm store:shots --no-room            skip the room (tiles 01 and 04 are then left as they are)
//   pnpm store:shots --url http://localhost:5173   use a dev server that is already running
//
// Sets: iphone, ipad, duoOuter, duoInner (docs/app-store/screenshots) and android,
// tablet (docs/play-store/screenshots). Needs .env.local and the test accounts in
// ~/.config/crossword-clash/shots-accounts.json (see scripts/shots.mjs). The room
// tiles play a real three-player room on production with those accounts: one
// finished test room per three sets. Nothing is uploaded to either store.
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { DEVICES, SHOW_DAY } from "./cap.mjs";
import { captureScenes, captureRoom } from "./capture.mjs";
import { compose } from "./compose.mjs";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? null : args.splice(i, 2)[1]; };
const has = (name) => { const i = args.indexOf(`--${name}`); return i !== -1 && args.splice(i, 1).length > 0; };
const outRoot = flag("out");
let url = flag("url");
const room = !has("no-room");
const sets = Object.keys(DEVICES).filter((d) => DEVICES[d].out);
const devs = args[0] ? args[0].split(",") : sets;
const unknown = devs.filter((d) => !sets.includes(d));
if (unknown.length) { console.error(`Unknown set: ${unknown.join(", ")}. Sets: ${sets.join(", ")}.`); process.exit(1); }

const raw = resolve("artifacts/store-shots/raw");
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

const problems = [];
try {
  console.log(`Showcase day ${SHOW_DAY}, app at ${url}`);
  for (const dev of devs) {
    const { failed, studioFrom } = await captureScenes(url, dev, raw);
    problems.push(...failed);
    console.log(`${dev}: screens captured (studio from ${studioFrom})`);
  }
  if (room) for (let i = 0; i < devs.length; i += 3) {
    const group = devs.slice(i, i + 3);
    try { console.log(`${group.join(", ")}: room ${await captureRoom(url, group, raw)} played`); }
    catch (e) { problems.push(`room for ${group.join(", ")}: ${String(e).split("\n")[0].slice(0, 200)}`); }
  }
  const outFor = (dev) => (outRoot ? join(resolve(outRoot), dev) : resolve(DEVICES[dev].out));
  problems.push(...(await compose(url, devs, raw, outFor, { room })));
  if (!room) console.log("Room skipped: tiles 01 and 04 were not rewritten.");
  for (const dev of devs) console.log(`${dev}: ${outFor(dev)}`);
} finally {
  server?.kill();
}
if (problems.length) { console.error(`\nNot everything was captured:\n  ${problems.join("\n  ")}`); process.exit(1); }
