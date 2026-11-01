// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SiteBar } from "./SiteBar";

let nativePlatform = false;
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => nativePlatform } }));

afterEach(() => {
  cleanup();
  nativePlatform = false;
});

describe("SiteBar", () => {
  // jsdom paints nothing, so this guards the classes: the bar's view-transition-name makes it a
  // stacking context, and without a z-index of its own the menus that open from it (the avatar
  // menu, the studio's account menu) painted under the studio grid (TestFlight build 21).
  it("lifts itself above the page so its menus open over positioned content", () => {
    const { container } = render(<SiteBar plain />);
    const header = container.querySelector("[data-site-bar]")!;
    expect(header.classList.contains("vt-site-bar")).toBe(true);
    expect(header.classList.contains("relative")).toBe(true);
    expect([...header.classList].some((c) => /^z-\d+$/.test(c))).toBe(true);
  });

  it("on the website keeps the logo first and the back control on the right", () => {
    const { container } = render(<SiteBar plain backLabel="Back" backTo="/menu" />);
    const header = container.querySelector("[data-site-bar]")!;
    expect(header.getAttribute("data-site-bar-layout")).toBeNull();
    const [first] = header.children;
    expect(first.querySelector("img[alt='Crossword Clash']")).not.toBeNull();
    expect(header.querySelector("[data-site-bar-right] a[href='/menu']")?.textContent).toBe("Back");
  });

  it("in the apps puts the back control on the left and the logo in the middle column", () => {
    nativePlatform = true;
    const { container } = render(<SiteBar plain backLabel="Back" backTo="/menu" />);
    const header = container.querySelector("[data-site-bar]")!;
    expect(header.getAttribute("data-site-bar-layout")).toBe("native");
    expect(header.classList.contains("grid")).toBe(true);
    expect([...header.classList].some((c) => c.startsWith("grid-cols-[1fr_auto_1fr]"))).toBe(true);
    const [left, middle, right] = header.children;
    expect(left.getAttribute("data-site-bar-left")).not.toBeNull();
    expect(left.querySelector("a[href='/menu']")?.textContent).toBe("Back");
    expect(middle.querySelector("img[alt='Crossword Clash']")).not.toBeNull();
    expect(right.getAttribute("data-site-bar-right")).not.toBeNull();
    expect(right.querySelector("a[href='/menu']")).toBeNull();
    expect(header.classList.contains("relative")).toBe(true);
    expect([...header.classList].some((c) => /^z-\d+$/.test(c))).toBe(true);
  });
});
