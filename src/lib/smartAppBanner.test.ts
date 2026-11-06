// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { smartAppBannerContent, syncSmartAppBanner } from "./smartAppBanner";
import { IOS_APP_ID, IOS_APP_STORE_URL } from "./platform";

describe("smart app banner", () => {
  it("names the app and the page, escaping the field separator", () => {
    expect(smartAppBannerContent("https://crosswordclash.com/?join=ABC123")).toBe(
      `app-id=${IOS_APP_ID}, app-argument=https://crosswordclash.com/?join=ABC123`,
    );
    expect(smartAppBannerContent("https://crosswordclash.com/puzzles?q=a,b")).toBe(
      `app-id=${IOS_APP_ID}, app-argument=https://crosswordclash.com/puzzles?q=a%2Cb`,
    );
  });

  it("points the tag at the current page, and does nothing without one", () => {
    document.head.innerHTML = '<meta name="apple-itunes-app" content="app-id=1">';
    syncSmartAppBanner(document, "https://crosswordclash.com/daily/2026-11-06/mini");
    expect(document.querySelector('meta[name="apple-itunes-app"]')!.getAttribute("content")).toBe(
      `app-id=${IOS_APP_ID}, app-argument=https://crosswordclash.com/daily/2026-11-06/mini`,
    );
    document.head.innerHTML = "";
    expect(() => syncSmartAppBanner(document, "https://crosswordclash.com/")).not.toThrow();
  });

  it("index.html carries the tag for the same app as the store link", () => {
    const html = fs.readFileSync("index.html", "utf8");
    expect(html).toContain(`<meta name="apple-itunes-app" content="app-id=${IOS_APP_ID}" />`);
    expect(IOS_APP_STORE_URL).toBe(`https://apps.apple.com/app/id${IOS_APP_ID}`);
  });
});
