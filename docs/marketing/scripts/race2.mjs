// The race on yesterday's Midi (today's has NYT as an answer, and store art must not show it).
import { open } from "./cap.mjs";
import { feed, stageRace, stageBoard } from "./stage.mjs";
const jobs = process.argv[2] === "test" ? [["iphone", { dpr: 1 }, process.env.ST + "/tmp"]] : [["iphone", {}], ["android", {}], ["ipad", { w: 688, h: 918, dpr: 3 }], ["tablet", { w: 640, h: 1024, dpr: 2.5 }]];
for (const [dev, o, out] of jobs) {
  const s = await open("plus", dev, out ?? process.env.ST + "/raw/" + dev, o);
  await stageRace(s.page, feed("2026-11-15", "midi"));
  await stageBoard(s.page, { selfId: s.userId, times: [231, 248, 263, 312, 345, 402, 471, 536], selfRank: 2 });
  await s.go("/daily/leaderboard/midi");
  const prev = s.page.getByRole("button", { name: /previous/i }).first();
  await s.tap(prev); await s.page.waitForTimeout(1800);
  await s.tap(s.page.getByTestId("the-race").last()); await s.page.waitForTimeout(800);
  const sl = s.page.getByRole("slider", { name: "Race clock" });
  await sl.fill("165000"); await s.page.waitForTimeout(300); await s.shot("race");
  if (dev === "iphone" && !out) { const max = Number(await sl.getAttribute("max")); for (let i = 0; i < 150; i++) { await sl.fill(String(Math.round(((i / 149) * max) / 250) * 250)); await s.page.screenshot({ path: process.env.ST + "/frames/race/" + String(i + 1).padStart(4, "0") + ".jpg", type: "jpeg", quality: 92 }); } }
  console.log(dev, s.errors.slice(0, 2));
  await s.close();
}
