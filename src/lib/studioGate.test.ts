import { describe, expect, it } from "vitest";
import { studioAdminPanelsAllowed, studioAssetsNeeded, studioGateBypassed, studioRouteEnabled, studioVerdict } from "./studioGate";

describe("studio route and gate rules", () => {
  it("registers the route in dev, with VITE_STUDIO=1, and on every Plus build, the apps included", () => {
    expect(studioRouteEnabled({ DEV: true })).toBe(true);
    expect(studioRouteEnabled({ DEV: false, VITE_STUDIO: "1" })).toBe(true);
    expect(studioRouteEnabled({ DEV: false, VITE_PLUS: "1", MODE: "production" })).toBe(true);
    // Since 2026-10-28 the studio is a Plus feature on phones too.
    expect(studioRouteEnabled({ DEV: false, VITE_PLUS: "1", MODE: "mobile" })).toBe(true);
    expect(studioRouteEnabled({ DEV: false, MODE: "production" })).toBe(false);
    expect(studioRouteEnabled({ DEV: false, MODE: "mobile" })).toBe(false);
    expect(studioRouteEnabled({ DEV: false, VITE_PLUS: "0" })).toBe(false);
  });

  it("bypasses the gate only in dev and VITE_STUDIO builds", () => {
    expect(studioGateBypassed({ DEV: true })).toBe(true);
    expect(studioGateBypassed({ VITE_STUDIO: "1" })).toBe(true);
    expect(studioGateBypassed({ DEV: false, VITE_PLUS: "1" })).toBe(false);
    expect(studioGateBypassed({ DEV: false, VITE_PLUS: "1", MODE: "mobile" })).toBe(false);
  });

  it("keeps the worker and wasm wherever the route can render the editor", () => {
    expect(studioAssetsNeeded({ DEV: false, VITE_PLUS: "1", MODE: "production" })).toBe(true);
    expect(studioAssetsNeeded({ DEV: false, VITE_PLUS: "1", MODE: "mobile" })).toBe(true);
    expect(studioAssetsNeeded({ DEV: false, MODE: "mobile" })).toBe(false);
    expect(studioAssetsNeeded({ DEV: false })).toBe(false);
  });

  it("keeps the admin panels off the apps whoever is signed in", () => {
    expect(studioAdminPanelsAllowed({ MODE: "production" })).toBe(true);
    expect(studioAdminPanelsAllowed({ DEV: true, MODE: "development" })).toBe(true);
    expect(studioAdminPanelsAllowed({ MODE: "mobile" })).toBe(false);
  });

  it("decides what the gate shows", () => {
    const base = { bypass: false, ready: true, plusReady: true, signedIn: false, admin: false, plus: false };
    expect(studioVerdict({ ...base, bypass: true, ready: false })).toBe("editor");
    expect(studioVerdict({ ...base, ready: false })).toBe("loading");
    expect(studioVerdict({ ...base, signedIn: true, admin: true, plusReady: false })).toBe("editor");
    expect(studioVerdict({ ...base, plusReady: false })).toBe("loading");
    expect(studioVerdict({ ...base, plus: true })).toBe("editor");
    expect(studioVerdict({ ...base, signedIn: true, plus: true })).toBe("editor");
    expect(studioVerdict({ ...base, signedIn: true })).toBe("plus");
    expect(studioVerdict(base)).toBe("sign-in");
  });
});
