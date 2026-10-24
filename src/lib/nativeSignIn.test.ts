import { describe, expect, it } from "vitest";
import { nativeProviders, randomNonce } from "./nativeSignIn";

describe("nativeProviders", () => {
  it("offers nothing outside a mobile build on a phone", () => {
    expect(nativeProviders({ MODE: "production", VITE_GOOGLE_WEB_CLIENT_ID: "w" }, "ios")).toEqual([]);
    expect(nativeProviders({ MODE: "mobile", VITE_GOOGLE_WEB_CLIENT_ID: "w" }, "web")).toEqual([]);
  });

  it("offers Apple on iOS always, and Google once its client ids are set for the platform", () => {
    expect(nativeProviders({ MODE: "mobile" }, "ios")).toEqual(["apple"]);
    expect(nativeProviders({ MODE: "mobile", VITE_GOOGLE_WEB_CLIENT_ID: "w" }, "ios")).toEqual(["apple"]);
    expect(nativeProviders({ MODE: "mobile", VITE_GOOGLE_WEB_CLIENT_ID: "w", VITE_GOOGLE_IOS_CLIENT_ID: "i" }, "ios")).toEqual(["apple", "google"]);
    expect(nativeProviders({ MODE: "mobile" }, "android")).toEqual([]);
    expect(nativeProviders({ MODE: "mobile", VITE_GOOGLE_WEB_CLIENT_ID: "w" }, "android")).toEqual(["google"]);
  });
});

describe("randomNonce", () => {
  it("is 32 hex characters and never repeats", () => {
    const a = randomNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(randomNonce()).not.toBe(a);
  });
});
