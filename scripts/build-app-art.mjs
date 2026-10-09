// Regenerates launcher icons and splash screens for both native apps from the
// one approved icon (the iOS catalog PNG). Run: node scripts/build-app-art.mjs
// Uses the Playwright browser that the e2e suite already installs.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const path = (p) => fileURLToPath(new URL(p, root));
const ART = `data:image/png;base64,${readFileSync(path("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")).toString("base64")}`;
// The artwork's own field colour; also android values/ic_launcher_background.xml.
const BLUE = "#1956f5";
const RES = "android/app/src/main/res";
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(file, width, height, body, transparent = false) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<body style="margin:0;width:${width}px;height:${height}px;overflow:hidden;display:grid;place-items:center;${transparent ? "" : "background:#fff"}">${body}</body>`);
  await page.screenshot({ path: path(file), omitBackground: transparent });
}

// Splash: the icon as a rounded tile on white, sized off the short edge.
const splash = (size) => `<img src="${ART}" style="width:${size}px;height:${size}px;border-radius:22.5%">`;
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  // aspect-fill crops this square to the screen, so size for a phone's width
  await render(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`, 2732, 2732, splash(440));
}
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [density, [w, h]] of Object.entries(SPLASH)) {
  await render(`${RES}/drawable-port-${density}/splash.png`, w, h, splash(Math.round(w * 0.34)));
  await render(`${RES}/drawable-land-${density}/splash.png`, h, w, splash(Math.round(w * 0.34)));
}
await render(`${RES}/drawable/splash.png`, 480, 320, splash(109));

// Adaptive icon: the art sits inside the 66dp safe circle of the 108dp layer.
// Its edge fades out so the art's field blends into the solid background layer.
for (const [density, scale] of Object.entries(DENSITIES)) {
  const layer = 108 * scale;
  const art = Math.round(layer * 0.54);
  await render(`${RES}/mipmap-${density}/ic_launcher_foreground.png`, layer, layer,
    `<img src="${ART}" style="width:${art}px;height:${art}px;-webkit-mask:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent),linear-gradient(transparent,#000 5%,#000 95%,transparent);-webkit-mask-composite:source-in;mask-composite:intersect">`, true);
  // Legacy launchers (Android 7): the full art, rounded square and circle.
  const legacy = 48 * scale;
  await render(`${RES}/mipmap-${density}/ic_launcher.png`, legacy, legacy,
    `<img src="${ART}" style="width:${legacy}px;height:${legacy}px;border-radius:20%">`, true);
  await render(`${RES}/mipmap-${density}/ic_launcher_round.png`, legacy, legacy,
    `<div style="width:${legacy}px;height:${legacy}px;border-radius:50%;background:${BLUE};display:grid;place-items:center;overflow:hidden"><img src="${ART}" style="width:${Math.round(legacy * 0.74)}px"></div>`, true);
}
await browser.close();
console.log("Rendered native icons and splash screens from the app icon.");
