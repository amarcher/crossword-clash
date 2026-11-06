// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppStoreBanner, APP_BANNER_DISMISSED_KEY, APP_BANNER_QUIET_MS } from "./AppStoreBanner";
import { IOS_APP_STORE_URL } from "../lib/platform";

const track = vi.fn();
vi.mock("../lib/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));

const UA = {
  chrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1",
  safari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36",
};
const useAgent = (ua: string) => vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua);

describe("AppStoreBanner", () => {
  beforeEach(() => { localStorage.clear(); track.mockClear(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("offers the App Store in Chrome on an iPhone, and tracks the tap", () => {
    useAgent(UA.chrome);
    render(<AppStoreBanner />);
    const get = screen.getByRole("link", { name: "Get" });
    expect(get.getAttribute("href")).toBe(IOS_APP_STORE_URL);
    fireEvent.click(get);
    expect(track).toHaveBeenCalledWith("app_store_click", { placement: "banner" });
  });

  it("stays out of Safari, where Apple's own banner shows", () => {
    useAgent(UA.safari);
    expect(render(<AppStoreBanner />).container.innerHTML).toBe("");
  });

  it("offers Google Play on Android with the banner's own referrer, but not on a Fire tablet", () => {
    useAgent(UA.android);
    render(<AppStoreBanner />);
    const install = screen.getByRole("link", { name: "Install" });
    expect(install.getAttribute("href")).toContain("id=com.crosswordclash.app");
    expect(install.getAttribute("href")).toContain("utm_medium%3Dbanner");
    fireEvent.click(install);
    expect(track).toHaveBeenCalledWith("play_store_click", { placement: "banner" });
    cleanup();
    useAgent("Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit/537.36 Silk/131.0 Chrome/131.0 Safari/537.36");
    expect(render(<AppStoreBanner />).container.innerHTML).toBe("");
  });

  it("closing it keeps it away for 30 days on this device", () => {
    useAgent(UA.chrome);
    render(<AppStoreBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("link", { name: "Get" })).toBeNull();
    expect(track).toHaveBeenCalledWith("app_banner_dismissed", { placement: "banner", store: "ios" });
    cleanup();
    render(<AppStoreBanner />);
    expect(screen.queryByRole("link", { name: "Get" })).toBeNull();
    cleanup();
    localStorage.setItem(APP_BANNER_DISMISSED_KEY, String(Date.now() - APP_BANNER_QUIET_MS - 1));
    render(<AppStoreBanner />);
    expect(screen.getByRole("link", { name: "Get" })).toBeTruthy();
  });
});
