// The studio screen for the store tiles, on each store device, with the puzzle built for the video.
import { open } from "./cap.mjs";
import { readFileSync } from "node:fs";
const ST = process.env.ST;
const d = JSON.parse(readFileSync(ST + "/studio/draft-clued.json", "utf8"));
d.cursor = Number(process.env.CURSOR ?? 54); d.dir = "across";
const init = `localStorage.setItem("crossword-clash:studio", ${JSON.stringify(JSON.stringify(d))})`;
for (const [dev, o] of [["iphone", {}], ["android", {}], ["ipad", { w: 688, h: 918, dpr: 3 }], ["tablet", { w: 640, h: 1024, dpr: 2.5 }]]) {
  const s = await open("plus", dev, ST + "/raw/" + dev, { ...o, init });
  await s.go("/studio", 7000);
  await s.page.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode()); ) if (n.nodeValue.includes("shots-plus@")) n.nodeValue = "maya"; });
  await s.page.waitForTimeout(300);
  await s.shot("studio");
  await s.close();
}
