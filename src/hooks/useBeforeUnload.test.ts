// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useBeforeUnload } from "./useBeforeUnload";

afterEach(cleanup);

describe("useBeforeUnload", () => {
  it("adds beforeunload listener when active is true", () => {
    const spy = vi.spyOn(window, "addEventListener");
    renderHook(() => useBeforeUnload(true));
    expect(spy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    spy.mockRestore();
  });

  it("does not add listener when active is false", () => {
    const spy = vi.spyOn(window, "addEventListener");
    renderHook(() => useBeforeUnload(false));
    expect(spy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));
    spy.mockRestore();
  });

  it("removes listener on cleanup", () => {
    const spy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useBeforeUnload(true));
    unmount();
    expect(spy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    spy.mockRestore();
  });

  it("toggles listener when active changes", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { rerender } = renderHook(({ active }) => useBeforeUnload(active), {
      initialProps: { active: false },
    });

    expect(addSpy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));

    rerender({ active: true });
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    rerender({ active: false });
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("calls preventDefault on the event", () => {
    renderHook(() => useBeforeUnload(true));
    const event = new Event("beforeunload", { cancelable: true });
    const spy = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);
    expect(spy).toHaveBeenCalled();
  });
});
