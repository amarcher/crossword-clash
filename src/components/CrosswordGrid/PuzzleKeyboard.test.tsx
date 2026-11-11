// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { CLICK_AFTER_POINTER_MS, PuzzleKeyboard } from "./PuzzleKeyboard";
import { useGridNavigation } from "./useGridNavigation";

afterEach(cleanup);
const actions = () => ({ inputLetter: vi.fn(), deleteLetter: vi.fn(), moveSelection: vi.fn(),
  nextWord: vi.fn(), prevWord: vi.fn(), toggleDirection: vi.fn() });

describe("puzzle keyboard", () => {
  it("is immediately available without focusing a text input and emits one letter per tap", () => {
    const a = actions();
    const ui = render(<PuzzleKeyboard actions={a} />);
    expect(ui.container.querySelector("input")).toBeNull();
    for (const letter of "CAT") fireEvent.click(ui.getByRole("button", { name: letter }));
    expect(a.inputLetter.mock.calls).toEqual([["C"], ["A"], ["T"]]);
    fireEvent.click(ui.getByRole("button", { name: "Delete letter" }));
    expect(a.deleteLetter).toHaveBeenCalledOnce();
    fireEvent.click(ui.getByRole("button", { name: "Switch Across / Down" }));
    expect(a.toggleDirection).toHaveBeenCalledOnce();
  });
  it("preserves multiplayer's no-delete rule and disables entry behind a sheet", () => {
    const a = actions();
    const ui = render(<PuzzleKeyboard actions={a} allowDelete={false} />);
    expect(ui.queryByRole("button", { name: "Delete letter" })).toBeNull();
    fireEvent.click(ui.getByRole("button", { name: "Next clue" }));
    expect(a.nextWord).toHaveBeenCalledOnce();
    ui.rerender(<PuzzleKeyboard actions={a} disabled />);
    fireEvent.click(ui.getByRole("button", { name: "A" }));
    expect(a.inputLetter).not.toHaveBeenCalled();
  });
  it("types when the finger lands, so overlapping thumbs lose no letter, and never twice for one tap", () => {
    const a = actions();
    const ui = render(<PuzzleKeyboard actions={a} />);
    const key = (name: string) => ui.getByRole("button", { name });
    // Rollover: C down, A down before C lifts. A phone makes no click out of either touch.
    fireEvent.pointerDown(key("C"));
    fireEvent.pointerDown(key("A"));
    fireEvent.pointerUp(key("C"));
    fireEvent.pointerUp(key("A"));
    expect(a.inputLetter.mock.calls).toEqual([["C"], ["A"]]);
    // A lone tap: pointer down, up, then the click the browser adds. One letter.
    fireEvent.pointerDown(key("T"));
    fireEvent.pointerUp(key("T"));
    fireEvent.click(key("T"));
    expect(a.inputLetter.mock.calls).toEqual([["C"], ["A"], ["T"]]);
    // A long hold still ends in that press's click, however late it comes.
    fireEvent.pointerDown(key("S"));
    fireEvent.click(key("S"));
    expect(a.inputLetter).toHaveBeenCalledTimes(4);
    // The same key twice in a row is two letters.
    for (let i = 0; i < 2; i++) {
      fireEvent.pointerDown(key("L"));
      fireEvent.pointerUp(key("L"));
      fireEvent.click(key("L"));
    }
    expect(a.inputLetter).toHaveBeenCalledTimes(6);
    // The action keys press the same way.
    fireEvent.pointerDown(key("Delete letter"));
    fireEvent.pointerUp(key("Delete letter"));
    fireEvent.click(key("Delete letter"));
    expect(a.deleteLetter).toHaveBeenCalledOnce();
  });
  it("still answers a click with no pointer (Enter on a key, a screen reader), also long after an unclicked touch", () => {
    const a = actions();
    const ui = render(<PuzzleKeyboard actions={a} />);
    const c = ui.getByRole("button", { name: "C" });
    fireEvent.click(c);
    expect(a.inputLetter).toHaveBeenCalledTimes(1);
    // A touch whose click never came (rollover), then an activation well after it.
    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    const up = new Event("pointerup", { bubbles: true });
    Object.defineProperty(up, "timeStamp", { value: 1000 });
    c.dispatchEvent(down);
    c.dispatchEvent(up);
    expect(a.inputLetter).toHaveBeenCalledTimes(2);
    const late = new MouseEvent("click", { bubbles: true });
    Object.defineProperty(late, "timeStamp", { value: 1000 + CLICK_AFTER_POINTER_MS + 1 });
    c.dispatchEvent(late);
    expect(a.inputLetter).toHaveBeenCalledTimes(3);
  });
  it("a disabled keyboard takes no touch, and a right mouse button is no press", () => {
    const a = actions();
    const ui = render(<PuzzleKeyboard actions={a} disabled />);
    fireEvent.pointerDown(ui.getByRole("button", { name: "A" }));
    expect(a.inputLetter).not.toHaveBeenCalled();
    ui.rerender(<PuzzleKeyboard actions={a} />);
    fireEvent.pointerDown(ui.getByRole("button", { name: "A" }), { pointerType: "mouse", button: 2 });
    expect(a.inputLetter).not.toHaveBeenCalled();
  });
  it("supports physical keyboards without stealing shortcuts or input in dialogs", () => {
    const a = actions();
    function Harness() { useGridNavigation(a); return <><button>Control</button><div role="dialog"><button>Dialog control</button></div></>; }
    const ui = render(<Harness />);
    fireEvent.keyDown(window, { key: "A" });
    expect(a.inputLetter).toHaveBeenCalledExactlyOnceWith("A");
    fireEvent.keyDown(window, { key: "a", metaKey: true });
    fireEvent.keyDown(ui.getByText("Dialog control"), { key: "C" });
    fireEvent.keyDown(ui.getByText("Control"), { key: " " });
    expect(a.inputLetter).toHaveBeenCalledOnce();
    expect(a.toggleDirection).not.toHaveBeenCalled();
  });
});
