import { describe, it, expect } from "vitest";
import { isAndroidBrowser, isDesktopBrowser, isIosBrowser, isIosSafari } from "./platform";

describe("isDesktopBrowser", () => {
  it("is true for a hover-capable fine pointer", () => {
    expect(isDesktopBrowser((q) => ({ matches: q === "(hover: hover) and (pointer: fine)" }))).toBe(true);
  });

  it("is false for touch devices", () => {
    expect(isDesktopBrowser(() => ({ matches: false }))).toBe(false);
  });

  it("is false when matchMedia is unavailable or throws", () => {
    expect(isDesktopBrowser(undefined)).toBe(false);
    expect(
      isDesktopBrowser(() => {
        throw new Error("no media queries here");
      }),
    ).toBe(false);
  });
});

describe("isIosBrowser", () => {
  it("recognises iPhone and iPad user agents", () => {
    expect(isIosBrowser({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)" })).toBe(true);
    expect(isIosBrowser({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)" })).toBe(true);
  });

  it("treats a touch-capable Mac user agent as iPadOS", () => {
    const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
    expect(isIosBrowser({ userAgent, maxTouchPoints: 5 })).toBe(true);
    expect(isIosBrowser({ userAgent, maxTouchPoints: 0 })).toBe(false);
  });

  it("is false elsewhere", () => {
    expect(isIosBrowser({ userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 10)", maxTouchPoints: 5 })).toBe(false);
    expect(isIosBrowser(undefined)).toBe(false);
  });
});

describe("isAndroidBrowser", () => {
  it("recognises Android phones and tablets", () => {
    expect(isAndroidBrowser({ userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 10) Chrome/141.0 Mobile Safari/537.36" })).toBe(true);
    expect(isAndroidBrowser({ userAgent: "Mozilla/5.0 (Linux; Android 15; SM-X910) Chrome/141.0 Safari/537.36" })).toBe(true);
  });

  it("leaves out Amazon Fire devices, which have no Google Play", () => {
    expect(
      isAndroidBrowser({ userAgent: "Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit/537.36 Silk/141.2 like Chrome/141.0 Safari/537.36" }),
    ).toBe(false);
    expect(isAndroidBrowser({ userAgent: "Mozilla/5.0 (Linux; Android 11; KFTRWI) Chrome/148.0 Safari/537.36" })).toBe(false);
  });

  it("is false elsewhere", () => {
    expect(isAndroidBrowser({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)" })).toBe(false);
    expect(isAndroidBrowser({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0 Safari/537.36" })).toBe(false);
    expect(isAndroidBrowser(undefined)).toBe(false);
  });
});

describe("isIosSafari", () => {
  const iphone = (tail: string) => ({ userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${tail}` });
  it("is true for Safari on iPhone and iPad (desktop-mode iPad included)", () => {
    expect(isIosSafari(iphone("Version/18.1 Mobile/15E148 Safari/604.1"))).toBe(true);
    expect(isIosSafari({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15", maxTouchPoints: 5 })).toBe(true);
  });
  it("is false for other iOS browsers and in-app web views, which ignore the Smart App Banner", () => {
    expect(isIosSafari(iphone("CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1"))).toBe(false);
    expect(isIosSafari(iphone("FxiOS/133.0 Mobile/15E148 Safari/605.1.15"))).toBe(false);
    expect(isIosSafari(iphone("Version/18.0 EdgiOS/131.0 Mobile/15E148 Safari/605.1.15"))).toBe(false);
    expect(isIosSafari(iphone("GSA/345.0 Mobile/15E148 Safari/604.1"))).toBe(false);
    expect(isIosSafari(iphone("Mobile/15E148 Instagram 357.0.0"))).toBe(false);
    expect(isIosSafari(iphone("Mobile/22B83 [FBAN/FBIOS;FBAV/490.0]"))).toBe(false);
    expect(isIosSafari(iphone("Mobile/15E148"))).toBe(false);
  });
  it("is false off iOS", () => {
    expect(isIosSafari({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15", maxTouchPoints: 0 })).toBe(false);
    expect(isIosSafari({ userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36" })).toBe(false);
    expect(isIosSafari(undefined)).toBe(false);
  });
});
