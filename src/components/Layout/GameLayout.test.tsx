// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameLayout, NativeGameLayout } from "./GameLayout";
import { resetInputModalityForTests, setHardwareKeyboard } from "../../lib/inputModality";

function renderLayout() {
  return render(
    <NativeGameLayout
      header={<h1>Puzzle</h1>}
      grid={<div>grid</div>}
      clues={<div>clue list</div>}
      mobileClueBar={<div className="native-clue-bar">1. A clue</div>}
      keyboard={<div role="group" aria-label="Crossword keyboard">keys</div>}
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetInputModalityForTests();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("NativeGameLayout", () => {
  it("shows the in-app keyboard until a physical key is pressed, then a Show keyboard button", () => {
    const { container } = renderLayout();
    expect(screen.getByRole("group", { name: "Crossword keyboard" })).toBeTruthy();
    expect(container.querySelector(".native-game-layout")?.getAttribute("data-keyboard")).toBe("screen");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));
    });

    expect(screen.queryByRole("group", { name: "Crossword keyboard" })).toBeNull();
    // The marker the CSS uses to drop the clue bar where the clue list is on screen.
    expect(container.querySelector(".native-game-layout")?.getAttribute("data-keyboard")).toBe("hardware");
    // The clue bar stays mounted: below 768px it is the only place the clue shows.
    expect(screen.getByText("1. A clue")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show keyboard" }));
    expect(screen.getByRole("group", { name: "Crossword keyboard" })).toBeTruthy();
  });

  it("starts in keyboard mode on a device that used one before", () => {
    setHardwareKeyboard(true);
    renderLayout();
    expect(screen.getByRole("button", { name: "Show keyboard" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Crossword keyboard" })).toBeNull();
  });
});

describe("GameLayout on the web", () => {
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
    vi.unstubAllGlobals();
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
  });

  it("pads the scroller past the on-screen keyboard so the grid can scroll up above it, and contains its overscroll", () => {
    const { container } = render(<GameLayout header={<h1>Puzzle</h1>} grid={<div>grid</div>} clues={<div>clues</div>} mobileClueBar={<div>1. A clue</div>} />);
    const main = container.querySelector("main")!;
    expect(main.className).toContain("overscroll-contain");
    expect(main.className).toContain("overflow-y-auto");
    expect(main.style.paddingBottom).toBe("");
    act(() => {
      vv.height = 480;
      vv.dispatchEvent(new Event("resize"));
    });
    // jsdom may reorder the terms when it serialises the declaration.
    expect(main.style.paddingBottom).toMatch(/^calc\((3\.5rem \+ 320px|320px \+ 3\.5rem)\)$/);
    act(() => {
      vv.height = 800;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(main.style.paddingBottom).toBe("");
  });
});
