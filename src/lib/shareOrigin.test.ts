import { afterEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ value: false }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.value } }));

const { shareOrigin } = await import("./shareOrigin");

afterEach(() => {
  native.value = false;
  vi.unstubAllGlobals();
});

describe("shareOrigin", () => {
  it("is the page's own origin on the web, so a preview shares preview links", () => {
    vi.stubGlobal("window", { location: { origin: "https://preview.example" } });
    expect(shareOrigin()).toBe("https://preview.example");
  });

  it("is the public site in the apps, whose origin (capacitor://localhost) means nothing elsewhere", () => {
    native.value = true;
    vi.stubGlobal("window", { location: { origin: "capacitor://localhost" } });
    expect(shareOrigin()).toBe("https://crosswordclash.com");
  });
});
