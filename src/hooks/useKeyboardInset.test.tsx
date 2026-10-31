// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { keyboardInset, readKeyboardInset, useKeyboardInset } from "./useKeyboardInset";

/** A stand-in for window.visualViewport: a resizable EventTarget. */
class FakeViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
}
let vv: FakeViewport;

beforeEach(() => {
  vv = new FakeViewport();
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  Object.defineProperty(document.documentElement, "clientHeight", { value: 800, configurable: true });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (cb(0), 1));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
});

describe("keyboardInset", () => {
  it("is what the visual viewport leaves uncovered at the bottom of the layout viewport", () => {
    expect(keyboardInset(800, { height: 500, offsetTop: 0 })).toBe(300);
    // Scrolled visual viewport (iOS pans the page when the keyboard opens): the offset counts.
    expect(keyboardInset(800, { height: 500, offsetTop: 40 })).toBe(260);
  });

  it("is never negative and is 0 without a visual viewport", () => {
    expect(keyboardInset(800, { height: 800, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(800, { height: 820, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(800, null)).toBe(0);
    expect(keyboardInset(800, undefined)).toBe(0);
  });

  it("reads the document", () => {
    vv.height = 450;
    expect(readKeyboardInset()).toBe(350);
  });
});

function Probe() {
  const inset = useKeyboardInset();
  return <output>{inset}</output>;
}

describe("useKeyboardInset", () => {
  it("starts at the current inset and follows the visual viewport's resizes", () => {
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("0");
    act(() => {
      vv.height = 480;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("status").textContent).toBe("320");
    act(() => {
      vv.height = 800;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("status").textContent).toBe("0");
  });

  it("is 0 in a browser without visualViewport", () => {
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("0");
  });
});
