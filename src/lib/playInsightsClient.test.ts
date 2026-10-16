import { describe, it, expect } from "vitest";
import { platformLabel } from "./playInsightsClient";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  ipadSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
  chromeOs: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
};

describe("platformLabel", () => {
  it("names the OS and browser family", () => {
    expect(platformLabel(UA.iphoneSafari, 5, false)).toBe("iOS Safari");
    expect(platformLabel(UA.iphoneChrome, 5, false)).toBe("iOS Chrome");
    expect(platformLabel(UA.androidChrome, 5, false)).toBe("Android Chrome");
    expect(platformLabel(UA.androidSamsung, 5, false)).toBe("Android Samsung");
    expect(platformLabel(UA.macChrome, 0, false)).toBe("macOS Chrome");
    expect(platformLabel(UA.macSafari, 0, false)).toBe("macOS Safari");
    expect(platformLabel(UA.windowsEdge, 0, false)).toBe("Windows Edge");
    expect(platformLabel(UA.linuxFirefox, 0, false)).toBe("Linux Firefox");
    expect(platformLabel(UA.chromeOs, 0, false)).toBe("ChromeOS Chrome");
  });

  it("tells an iPad from a Mac by its touch points (Safari lies about iPadOS)", () => {
    expect(platformLabel(UA.ipadSafari, 5, false)).toBe("iPadOS Safari");
    expect(platformLabel(UA.ipadSafari, 0, false)).toBe("macOS Safari");
  });

  it("labels the native apps by OS", () => {
    expect(platformLabel(UA.iphoneSafari, 5, true)).toBe("iOS app");
    expect(platformLabel(UA.androidChrome, 5, true)).toBe("Android app");
  });

  it("never throws on an empty or odd user agent", () => {
    expect(platformLabel("", 0, false)).toBe("Other Other");
    expect(platformLabel("curl/8.0", 0, false)).toBe("Other Other");
  });
});
