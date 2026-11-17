// Studio captures for the "make your own crossword" short: the phone layout, as frame sequences.
import { open } from "./cap.mjs";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
const ST = process.env.ST;
const s = await open("plus", "iphone", ST + "/studio", process.env.WEB === "1" ? { platform: null } : {});
const p = s.page;
const seq = (dir) => { const d = `${ST}/frames/${dir}`; rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); let n = 0; return async (hold = 1) => { n++; const f = `${d}/${String(n).padStart(4, "0")}.jpg`; await p.screenshot({ path: f, type: "jpeg", quality: 92 }); for (let k = 1; k < hold; k++) { n++; await p.screenshot({ path: `${d}/${String(n).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 }); } }; };
const tab = async (name) => { await s.tap(p.locator('nav [role="tab"]').filter({ hasText: name })); await p.waitForTimeout(500); };
await s.go("/studio", 7000);
console.log("engine:", (await p.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n/g, " | "));
// 1. Theme entries → lay out
let f = seq("st-layout");
await tab("More");
const ta = p.locator("textarea").first();
await ta.evaluate((e) => { const y = e.getBoundingClientRect().top + window.scrollY - 330; window.scrollTo(0, Math.max(0, y)); document.scrollingElement.scrollTop = Math.max(0, y); });
await p.locator("#studio-size").tap(); await p.waitForTimeout(300);
await p.getByRole("option", { name: "9×9", exact: true }).tap(); await p.waitForTimeout(300);
await ta.tap(); await f(3);
for (const ch of "game night, word nerds") { await p.keyboard.type(ch); await f(1); }
await f(4);
const blocks = async () => Number(((await p.evaluate(() => document.body.innerText)).match(/(\d+) blocks/) || [0, 99])[1]);
for (let k = 0; k < 8; k++) { await s.tap(p.getByRole("button", { name: "Lay out" })); await p.waitForTimeout(3500); const b = await blocks(); console.log("layout try", k, "blocks", b); if (b <= 15) break; }
await f(2);
await tab("Grid"); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(600);
await f(8);
// 2. Fill
f = seq("st-fill");
await f(4);
await s.tap(p.getByRole("button", { name: "Fill", exact: true }));
for (let i = 0; i < 10; i++) { await p.waitForTimeout(250); await f(1); }
await p.waitForTimeout(6000); await f(6);
await p.getByPlaceholder("Untitled puzzle").fill("Game Night"); await p.waitForTimeout(400);
// 3. Clues
f = seq("st-clues");
await tab("Clues"); await f(4);
await s.tap(p.getByRole("button", { name: "Draft all", exact: true }));
for (let i = 0; i < 300; i++) { await p.waitForTimeout(500); await f(1); const m = (await p.evaluate(() => document.body.innerText)).match(/Missing only \((\d+)\)/); if (i % 10 === 0) console.log("drafting", i, m && m[1]); if (!m || m[1] === "0") break; }
await p.waitForTimeout(1500);
await f(4);
writeFileSync(ST + "/studio/draft-clued.json", await p.evaluate(() => localStorage.getItem("crossword-clash:studio")));
// 4. Publish dialog (never submitted)
f = seq("st-publish");
await tab("More"); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(500); await f(3);
await s.tap(p.getByRole("button", { name: "Publish" }).first()); await p.waitForTimeout(2500);
await p.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode()); ) if (n.nodeValue.includes("shots_plus")) n.nodeValue = n.nodeValue.replace("shots_plus", "maya"); });
await f(4);
await s.tap(p.locator('[role=dialog] input[type=checkbox]')); await p.waitForTimeout(400); await f(6);
console.log("dialog:", (await p.locator("[role=dialog]").innerText().catch(() => "none")).replace(/\n+/g, " | ").slice(0, 600));
await s.tap(p.locator('[role=dialog]').getByRole("button", { name: "Close" })); await p.waitForTimeout(600);
await s.tap(p.getByRole("button", { name: "Play test" }).first()); await p.waitForTimeout(4000);
writeFileSync(ST + "/studio/play-url.txt", p.url());
await p.screenshot({ path: ST + "/studio/play-landing.png" });
console.log("play url len", p.url().length);
console.log("errors", s.errors.slice(0, 6));
await s.close();
