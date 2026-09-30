// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { PuzzleKeyboard } from "./PuzzleKeyboard";
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
