// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SiteBar } from "./SiteBar";

afterEach(cleanup);

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
});
