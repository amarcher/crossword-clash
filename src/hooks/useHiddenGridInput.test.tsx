// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, render, cleanup, fireEvent } from "@testing-library/react";
import { GRID_INPUT_SENTINEL, useHiddenGridInput, type HiddenGridInputHandlers } from "./useHiddenGridInput";

afterEach(cleanup);

/** Typed mocks for every handler; `extra` adds the optional ones a grid may ask for. */
function handlers(extra: Partial<Record<"words" | "block" | "enter", boolean>> = {}) {
  const fn = () => vi.fn<() => void>();
  return {
    onLetter: vi.fn<(letter: string) => void>(),
    onErase: fn(),
    onMove: vi.fn<(dRow: number, dCol: number) => void>(),
    onToggleDirection: fn(),
    onNextWord: extra.words ? fn() : undefined,
    onPrevWord: extra.words ? fn() : undefined,
    onToggleBlock: extra.block ? fn() : undefined,
    onEnter: extra.enter ? fn() : undefined,
  } satisfies HiddenGridInputHandlers;
}

function keyEvent(key: string, extra: Partial<React.KeyboardEvent> = {}) {
  return { key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, preventDefault: vi.fn(), ...extra } as unknown as React.KeyboardEvent<HTMLInputElement>;
}

function changeEvent(value: string) {
  return { currentTarget: { value } } as unknown as React.FormEvent<HTMLInputElement>;
}

function beforeInputEvent(data: string | null, cancelable: boolean) {
  return { nativeEvent: { data, cancelable }, preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLInputElement>;
}

describe("useHiddenGridInput", () => {
  it("keeps the input at 16px with a sentinel value and the accessibility wiring", () => {
    const { result } = renderHook(() => useHiddenGridInput(handlers(), { label: "Grid", activeDescendant: "cell-3", controls: "grid-1" }));
    const props = result.current.inputProps;
    expect(props.style.fontSize).toBe("16px");
    expect(props.value).toBe(GRID_INPUT_SENTINEL);
    expect(props["aria-label"]).toBe("Grid");
    expect(props["aria-activedescendant"]).toBe("cell-3");
    expect(props["aria-controls"]).toBe("grid-1");
  });

  it("maps keydown to letters, erase, arrows and space, and prevents the default", () => {
    const h = handlers();
    const { result } = renderHook(() => useHiddenGridInput(h, { label: "Grid" }));
    const { onKeyDown } = result.current.inputProps;

    const a = keyEvent("a");
    onKeyDown(a);
    expect(h.onLetter).toHaveBeenCalledWith("a");
    expect(a.preventDefault).toHaveBeenCalled();

    onKeyDown(keyEvent("Backspace"));
    onKeyDown(keyEvent("Delete"));
    expect(h.onErase).toHaveBeenCalledTimes(2);

    onKeyDown(keyEvent("ArrowUp"));
    onKeyDown(keyEvent("ArrowDown"));
    onKeyDown(keyEvent("ArrowLeft"));
    onKeyDown(keyEvent("ArrowRight"));
    expect(h.onMove.mock.calls).toEqual([[-1, 0], [1, 0], [0, -1], [0, 1]]);

    onKeyDown(keyEvent(" "));
    expect(h.onToggleDirection).toHaveBeenCalledTimes(1);
  });

  it("leaves Tab, '.' and Enter alone unless the grid asked for them", () => {
    const h = handlers();
    const { result } = renderHook(() => useHiddenGridInput(h, { label: "Grid" }));
    const { onKeyDown } = result.current.inputProps;
    for (const key of ["Tab", ".", "Enter"]) {
      const e = keyEvent(key);
      onKeyDown(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(h.onLetter).not.toHaveBeenCalled();
  });

  it("routes Tab / Shift+Tab to the word handlers and '.' and Enter to theirs", () => {
    const h = handlers({ words: true, block: true, enter: true });
    const { result } = renderHook(() => useHiddenGridInput(h, { label: "Grid" }));
    const { onKeyDown } = result.current.inputProps;
    const tab = keyEvent("Tab");
    onKeyDown(tab);
    onKeyDown(keyEvent("Tab", { shiftKey: true }));
    onKeyDown(keyEvent("."));
    onKeyDown(keyEvent("Enter"));
    expect(h.onNextWord!).toHaveBeenCalledTimes(1);
    expect(h.onPrevWord!).toHaveBeenCalledTimes(1);
    expect(h.onToggleBlock!).toHaveBeenCalledTimes(1);
    expect(h.onEnter!).toHaveBeenCalledTimes(1);
    expect(tab.preventDefault).toHaveBeenCalled();
  });

  it("ignores shortcuts with a modifier so the browser keeps them", () => {
    const h = handlers();
    const { result } = renderHook(() => useHiddenGridInput(h, { label: "Grid" }));
    const e = keyEvent("r", { metaKey: true });
    result.current.inputProps.onKeyDown(e);
    expect(h.onLetter).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("reads an erase from a change that lost the sentinel (Android keyCode 229)", () => {
    const h = handlers();
    const { result } = renderHook(() => useHiddenGridInput(h, { label: "Grid" }));
    result.current.inputProps.onChange(changeEvent(""));
    expect(h.onErase).toHaveBeenCalledTimes(1);
    expect(h.onLetter).not.toHaveBeenCalled();
  });

  it("reads letters, space and '.' from a change that kept the sentinel", () => {
    const h = handlers({ block: true });
    const { result } = renderHook(() => useHiddenGridInput(h, { label: "Grid" }));
    result.current.inputProps.onChange(changeEvent(`${GRID_INPUT_SENTINEL}ab .7`));
    expect(h.onLetter.mock.calls).toEqual([["a"], ["b"]]);
    expect(h.onToggleDirection).toHaveBeenCalledTimes(1);
    expect(h.onToggleBlock!).toHaveBeenCalledTimes(1);
    expect(h.onErase).not.toHaveBeenCalled();
  });

  it("takes a cancelable beforeinput letter and prevents it, but lets a composition commit fall through", () => {
    const h = handlers();
    const { result } = renderHook(() => useHiddenGridInput(h, { label: "Grid" }));
    const { onBeforeInput } = result.current.inputProps;

    const cancelable = beforeInputEvent("q", true);
    onBeforeInput(cancelable);
    expect(h.onLetter).toHaveBeenCalledWith("q");
    expect(cancelable.preventDefault).toHaveBeenCalled();

    const commit = beforeInputEvent("z", false);
    onBeforeInput(commit);
    expect(h.onLetter).toHaveBeenCalledTimes(1);
    expect(commit.preventDefault).not.toHaveBeenCalled();
  });

  it("does nothing without handlers", () => {
    const { result } = renderHook(() => useHiddenGridInput(null, { label: "Grid" }));
    const e = keyEvent("a");
    result.current.inputProps.onKeyDown(e);
    result.current.inputProps.onChange(changeEvent(""));
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("restores the sentinel after a real change event on the rendered input", () => {
    const h = handlers();
    function Host() {
      const { inputProps } = useHiddenGridInput(h, { label: "Grid" });
      return <input {...inputProps} />;
    }
    const { getByLabelText } = render(<Host />);
    const input = getByLabelText("Grid") as HTMLInputElement;
    expect(input.value).toBe(GRID_INPUT_SENTINEL);

    fireEvent.change(input, { target: { value: `${GRID_INPUT_SENTINEL}k` } });
    expect(h.onLetter).toHaveBeenCalledWith("k");
    expect(input.value).toBe(GRID_INPUT_SENTINEL);

    fireEvent.change(input, { target: { value: "" } });
    expect(h.onErase).toHaveBeenCalledTimes(1);
    expect(input.value).toBe(GRID_INPUT_SENTINEL);
  });

  it("uses the owner's ref when one is given", () => {
    const ref = { current: null as HTMLInputElement | null };
    function Host() {
      const { inputProps } = useHiddenGridInput(handlers(), { label: "Grid", ref });
      return <input {...inputProps} />;
    }
    render(<Host />);
    expect(ref.current?.tagName).toBe("INPUT");
  });
});
