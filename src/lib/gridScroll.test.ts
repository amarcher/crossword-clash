// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { REVEAL_MARGIN, scrollDeltaToReveal, scrollParent } from "./gridScroll";

describe("scrollDeltaToReveal", () => {
  const band = { visibleTop: 100, visibleBottom: 500 };

  it("moves nothing while the cell is inside the visible band", () => {
    expect(scrollDeltaToReveal({ top: 100, bottom: 140, ...band })).toBe(0);
    expect(scrollDeltaToReveal({ top: 300, bottom: 340, ...band })).toBe(0);
    expect(scrollDeltaToReveal({ top: 460, bottom: 500, ...band })).toBe(0);
  });

  it("scrolls down by exactly the overshoot plus the margin when the cell is under the bar", () => {
    expect(scrollDeltaToReveal({ top: 520, bottom: 560, ...band })).toBe(60 + REVEAL_MARGIN);
    // A cell poking one pixel under the bar still moves, by one pixel plus the margin.
    expect(scrollDeltaToReveal({ top: 461, bottom: 501, ...band })).toBe(1 + REVEAL_MARGIN);
  });

  it("scrolls up when the cell is above the top", () => {
    expect(scrollDeltaToReveal({ top: 40, bottom: 80, ...band })).toBe(-(60 + REVEAL_MARGIN));
  });

  it("takes a custom margin and rounds away from the edge", () => {
    expect(scrollDeltaToReveal({ top: 520, bottom: 560.4, ...band, margin: 0 })).toBe(61);
    expect(scrollDeltaToReveal({ top: 520, bottom: 560, ...band, margin: 20 })).toBe(80);
  });
});

describe("scrollParent", () => {
  it("finds the nearest ancestor that scrolls vertically, or null", () => {
    const page = document.createElement("div");
    page.style.overflowY = "hidden";
    const main = document.createElement("main");
    main.style.overflowY = "auto";
    const slot = document.createElement("div");
    const shell = document.createElement("div");
    page.append(main);
    main.append(slot);
    slot.append(shell);
    document.body.append(page);
    expect(scrollParent(shell)).toBe(main);
    main.style.overflowY = "visible";
    expect(scrollParent(shell)).toBeNull();
    expect(scrollParent(null)).toBeNull();
    page.remove();
  });
});
