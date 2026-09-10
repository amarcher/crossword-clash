import { describe, it, expect } from "vitest";
import { isDesktopBrowser } from "./platform";

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
